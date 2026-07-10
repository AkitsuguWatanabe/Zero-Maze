import { NextRequest, NextResponse } from "next/server";
import { generateFinalText } from "@/lib/evaluate-core";
import { getTenantModelOverrides } from "@/lib/server-auth";
import type { InstructionDraft, AssigneeRank, SupportMode } from "@/lib/mock-data";

const VALID_RANKS: AssigneeRank[] = ["A", "B", "C", "D"];

// Same reasoning-model latency issue as /api/evaluate — raised to 180s
// since 120s was observed being hit in production.
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  let body: { draft: InstructionDraft; assignee_rank?: string; support_mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { draft, assignee_rank, support_mode } = body ?? {};
  if (!draft?.overview) {
    return NextResponse.json({ error: "指示概要（overview）は必須です" }, { status: 400 });
  }

  const rank: AssigneeRank = VALID_RANKS.includes(assignee_rank as AssigneeRank)
    ? (assignee_rank as AssigneeRank)
    : "B";
  const mode: SupportMode = support_mode === "coaching" ? "coaching" : "efficiency";

  try {
    const overrides = await getTenantModelOverrides();
    const modelOverride = (draft.importance === "high" ? overrides.high : overrides.standard) ?? undefined;
    const final_instruction = await generateFinalText(draft, rank, mode, modelOverride);
    return NextResponse.json({ final_instruction });
  } catch (err) {
    console.error("[/api/generate-text]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "生成に失敗しました" },
      { status: 500 },
    );
  }
}
