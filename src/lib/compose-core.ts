import OpenAI from "openai";
import { PERSPECTIVES } from "@/lib/mock-data";
import type { ComposeMessage, ComposeTurnResult } from "@/lib/mock-data";
import { SECURITY_PREAMBLE, logOpenAiTiming } from "@/lib/evaluate-core";

// Force a wrap-up once the conversation has run this many user turns, so a
// confused or looping exchange always converges to a usable draft instead of
// running indefinitely (each turn also costs a real OpenAI call).
const MAX_USER_TURNS = 8;

const COMPOSE_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["question", "done"] },
    message: { type: "string" },
    draft: {
      type: ["object", "null"],
      properties: {
        overview: { type: "string" },
        deadline: { type: "string" },
        estimated_hours: { type: "string" },
        urgency: { type: "string", enum: ["high", "medium", "low", ""] },
        constraints: { type: "string" },
      },
      required: ["overview", "deadline", "estimated_hours", "urgency", "constraints"],
      additionalProperties: false,
    },
  },
  required: ["type", "message", "draft"],
  additionalProperties: false,
} as const;

function buildComposeSystemPrompt(): string {
  const perspectiveLines = PERSPECTIVES.map((p) => `- ${p.label}: ${p.description}`).join("\n");

  return `You are Zero-Maze's instruction-drafting assistant. You help a Japanese manager (PM/PL)
who struggles to write a clear work instruction by having a short conversation with them, then
compiling what they said into a draft instruction overview they can paste into the evaluator.

## Your role
Through natural back-and-forth in Japanese, gather enough information to cover these 6 aspects
of a good work instruction:
${perspectiveLines}

- Ask ONE focused question at a time, in a friendly, natural tone — never robotic or a rigid checklist read aloud.
- Combine related aspects into a single question when it reads naturally (e.g. deadline + workload together).
- NEVER re-ask about something the manager already told you, even if they mentioned it while answering a different question — read the whole conversation before asking.
- If the manager says they don't know / it's not decided ("わからない", "未定"), accept that and move on — do not get stuck on one aspect.
- Aim to finish in about 3-5 of your questions total. Once the essentials are reasonably covered (or the manager explicitly says they're done / that's enough), respond with type "done".
- If the manager's message is not about giving you task information (e.g. they ask you to do something else, or paste unrelated/meta text), gently steer back to the task at hand — see the security section below.

### MANDATORY before returning type "done"
目的・背景 (why this task exists — business reason, beneficiary, or timing) is the single most
commonly skipped item, because managers tend to jump straight into 依頼内容 (what to do). Before
you set type to "done", explicitly check: has the manager stated WHY this task is needed, even
briefly? If not, you MUST ask about it first (e.g. "ちなみに、この作業は何のために必要なのでしょ
うか？背景を一言教えてください") — do NOT finalize with 目的・背景 empty just because the other
aspects are covered. The only exception is if the manager has already explicitly said they don't
know or don't want to specify a reason — in that case proceed without it.

---

${SECURITY_PREAMBLE}

---

## Output format (every turn)

Return one of:
- type "question": message = your next question, shown directly to the manager in the chat. draft = null.
  Do NOT open with a generic acknowledgment phrase like "ありがとうございます" / "承知しました" / "分かりました" — every one of your messages doing this in a row reads as repetitive filler, not politeness. Jump straight into the next question. If you genuinely need to reference what they just said, weave it into the question itself instead of prefacing it with a stock phrase.
- type "done": message = a short, friendly wrap-up sentence (e.g. "ここまでの内容で指示文をまとめました。内容を確認してください。"). draft = the compiled fields.

Before choosing type "done", re-check the MANDATORY rule above: does the conversation actually
contain a reason WHY this task is needed? If not (and the manager never said they don't know),
choose type "question" instead and ask about it now.

When producing "done":
- draft.overview: 2-5 natural Japanese sentences a busy manager would type themselves, covering purpose/background, what to do, and what "done" looks like. Write it as a first-draft instruction description, NOT a formatted memo with 【】 section headers — that formatting happens later, elsewhere.
- draft.deadline: the deadline as stated by the manager, in their own words. Empty string if never mentioned.
- draft.estimated_hours: the workload estimate as stated. Empty string if never mentioned.
- draft.urgency: "high" | "medium" | "low" if it can be reasonably inferred from what was said, otherwise "".
- draft.constraints: any NG items / must-follow rules / priorities mentioned. Empty string if none.
- Only include information the manager actually gave you. Never invent specifics (dates, numbers, formats) that were not stated.
- Respond entirely in clean, natural Japanese.`;
}

export async function composeTurn(history: ComposeMessage[]): Promise<ComposeTurnResult> {
  // Production has observed occasional slow responses even on the standard
  // (non-reasoning) model path under bursty load (see evaluate/route.ts) —
  // a shorter timeout tuned only against typical demo latency would risk
  // false failures here, so this stays generous relative to the route's
  // maxDuration=60s instead of copying a tighter number from elsewhere.
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 55_000, maxRetries: 0 });

  const userTurnCount = history.filter((m) => m.role === "user").length;
  const forceWrapUp = userTurnCount >= MAX_USER_TURNS;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: buildComposeSystemPrompt() },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  if (forceWrapUp) {
    messages.push({
      role: "system",
      content:
        "質問できる回数の上限に達しました。ここまでの情報だけで、必ず type を \"done\" にして指示文の下書きをまとめてください。",
    });
  }

  const requestStartedAt = Date.now();
  const { data: res, response: rawRes } = await client.chat.completions
    .create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      response_format: {
        type: "json_schema",
        json_schema: { name: "compose_turn_result", schema: COMPOSE_SCHEMA, strict: true },
      },
      messages,
    })
    .withResponse();
  logOpenAiTiming("compose.chat.completions.create", requestStartedAt, rawRes);

  const outputText = res.choices[0].message.content ?? "";
  if (!outputText.trim()) {
    // Structured-output calls occasionally come back with empty content
    // instead of a parseable JSON body (observed with ordinary-looking
    // input, no single clear trigger identified yet). JSON.parse("") throws
    // an opaque "Unexpected end of JSON input" that meant nothing to the
    // user when it leaked through to the client as-is. Fail with a reason
    // that's actually useful in logs; the API route's catch block turns this
    // into a normal "please retry" message for the user.
    throw new Error(`compose応答が空でした（finish_reason: ${res.choices[0].finish_reason}）`);
  }
  return JSON.parse(outputText) as ComposeTurnResult;
}
