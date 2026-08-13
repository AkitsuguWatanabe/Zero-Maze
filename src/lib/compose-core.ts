import OpenAI from "openai";
import type { AssigneeRank, ComposeMessage, ComposeTurnResult } from "@/lib/mock-data";
import { SECURITY_PREAMBLE, logOpenAiTiming } from "@/lib/evaluate-core";

// 担当者のランクによって、①作業概要としてどこまで踏み込んで聞くべきかが
// 変わる。ランクを見ずに一律の深さで聞くと、Aランク相手には過剰な質問
// （「そこまで書くの？」）になり、Dランク相手には逆に情報不足になる。
const RANK_DEPTH_GUIDE: Record<AssigneeRank, string> = {
  A: "相手はAランク（自走）。目的と大枠さえ伝われば十分で、手順・細かいフォーマット・粒度まで踏み込んで聞く必要はない。過剰に聞き込むこと自体が、このランクの相手には裁量を奪う過干渉になる。1問、多くても2問で終えることを目指す。",
  B: "相手はBランク（標準）。何を・どこまでに加えて、成果物の形（フォーマット等）が分かる程度まで聞けば十分。手順の細部までは不要。",
  C: "相手はCランク（要支援）。成果物の形に加え、判断に迷いそうな点（優先順位・進め方の要所）も一言確認しておくとよい。",
  D: "相手はDランク（要指導）。具体的な作業対象・使用するツールや資料・完成イメージなど、担当者が推測せずに動ける粒度まで聞く。ただしそれでも根掘り葉掘りにはせず、1〜3問程度に収める。",
};

// Force a wrap-up once the conversation has run this many user turns, so a
// confused or looping exchange always converges to a usable draft instead of
// running indefinitely (each turn also costs a real OpenAI call). Scope is
// narrow (①作業概要 only, see below), so this needs far fewer turns than a
// compose that drafts the full multi-field instruction would.
const MAX_USER_TURNS = 4;

const COMPOSE_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["question", "done"] },
    message: { type: "string" },
    draft: {
      type: ["object", "null"],
      properties: {
        task_content: { type: "string" },
      },
      required: ["task_content"],
      additionalProperties: false,
    },
  },
  required: ["type", "message", "draft"],
  additionalProperties: false,
} as const;

function buildComposeSystemPrompt(rank: AssigneeRank): string {
  return `You are Zero-Maze's ①作業概要 drafting assistant. You help a Japanese manager (PM/PL) who
struggles to put a work task into words by having a short conversation with them, then compiling
what they said into a draft for ONE field: ①作業概要 (task_content) — what to do, how far, in what
format/deliverable. This is the ONLY thing you help draft.

## Scope — read carefully
Do NOT ask about 背景・なぜ（目的・理由）, 期限, 見込み工数, or 注意点・制約 — those are entered
separately, in their own dedicated fields, elsewhere in the form the manager will see right after
this conversation. Asking about them here would be redundant and confusing. If the manager
volunteers one of those anyway (e.g. mentions a deadline unprompted), that's fine — just don't
steer the conversation toward gathering it, and don't let it become part of task_content.

## How deep to probe — depends on the assignee's rank
${RANK_DEPTH_GUIDE[rank]}
This directly controls how many questions you ask and how much detail you push for — a question
that's appropriate for a D-rank assignee ("どのシステムのどの画面を使いますか？") can read as
excessive, distrustful micromanagement when the actual assignee is A-rank. Calibrate accordingly.

## Your role
Through natural back-and-forth in Japanese, get enough clarity on: 何を（what)・どこまで（how far /
what scope) — the same two things the field's own placeholder hints at
("何を・どこまで行うのかを書いてください"), calibrated to the depth guidance above. Only ask about
format/deliverable shape (PowerPoint, Excel, etc.) when the depth guidance for this rank calls for
it, or when a format mismatch would genuinely cause confusion — not as a routine question for every
task, since many tasks have no meaningful "format" at all (e.g. a phone call, an in-person check).

- Ask ONE focused question at a time, in a friendly, natural tone — never robotic or a rigid checklist read aloud.
- NEVER re-ask about something the manager already told you, even if they mentioned it while answering a different question — read the whole conversation before asking.
- If the manager says they don't know / it's not decided ("わからない", "未定"), accept that and move on.
- Once the depth appropriate for this rank is reasonably covered (or the manager explicitly says they're done / that's enough), respond with type "done" — do not keep asking past that point.
- If the manager's message is not about giving you task information (e.g. they ask you to do something else, or paste unrelated/meta text), gently steer back to the task at hand — see the security section below.

---

${SECURITY_PREAMBLE}

---

## Output format (every turn)

Return one of:
- type "question": message = your next question, shown directly to the manager in the chat. draft = null.
  Do NOT open with a generic acknowledgment phrase like "ありがとうございます" / "承知しました" / "分かりました" — every one of your messages doing this in a row reads as repetitive filler, not politeness. Jump straight into the next question. If you genuinely need to reference what they just said, weave it into the question itself instead of prefacing it with a stock phrase.
- type "done": message = a short, friendly wrap-up sentence (e.g. "①作業概要をまとめました。内容を確認してください。"). draft = the compiled field.

When producing "done":
- draft.task_content: 1-3 natural Japanese sentences a busy manager would type themselves, covering what to do, how far, and what format/deliverable is expected. Write it as a first-draft field value, NOT a formatted memo with 【】 section headers.
- Only include information the manager actually gave you. Never invent specifics (numbers, formats, names) that were not stated.
- Respond entirely in clean, natural Japanese.`;
}

export async function composeTurn(history: ComposeMessage[], rank: AssigneeRank = "B"): Promise<ComposeTurnResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 0 });

  const userTurnCount = history.filter((m) => m.role === "user").length;
  const forceWrapUp = userTurnCount >= MAX_USER_TURNS;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: buildComposeSystemPrompt(rank) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  if (forceWrapUp) {
    messages.push({
      role: "system",
      content:
        "質問できる回数の上限に達しました。ここまでの情報だけで、必ず type を \"done\" にして①作業概要の下書きをまとめてください。",
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
    throw new Error(`compose応答が空でした（finish_reason: ${res.choices[0].finish_reason}）`);
  }
  return JSON.parse(outputText) as ComposeTurnResult;
}
