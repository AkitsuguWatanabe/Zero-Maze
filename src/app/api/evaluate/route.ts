import { NextRequest, NextResponse } from "next/server";
import { APIConnectionTimeoutError } from "openai";
import { evaluateInstruction } from "@/lib/evaluate-core";
import { getTenantModelOverrides, getCurrentUserContext } from "@/lib/server-auth";
import { getSupabaseServer } from "@/lib/supabase";
import { mergeTeamCategories, flattenCategories } from "@/lib/mock-data";
import type { InstructionDraft, AssigneeRank, SupportMode, TeamCategoryOverride } from "@/lib/mock-data";

const VALID_RANKS: AssigneeRank[] = ["A", "B", "C", "D"];

// Production logs showed repeated "Task timed out after 120 seconds" 504s here —
// confirmed as the actual Vercel cutoff (not silently downgraded from a lower plan
// limit). This happened even on the standard-importance path (gpt-4.1-mini, non-
// reasoning), not just the gpt-5.5 reasoning path used for high-importance items —
// likely transient OpenAI-side latency/rate-limiting under bursty request patterns
// rather than reasoning-model latency specifically. Raised to 180s (Vercel Pro
// allows up to 300s) to absorb slow responses regardless of cause.
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  let body: { draft: InstructionDraft; assignee_rank?: string; support_mode?: string; team_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { draft, assignee_rank, support_mode, team_id } = body ?? {};
  if (!draft?.overview?.trim()) {
    return NextResponse.json({ error: "指示概要（overview）は必須です" }, { status: 400 });
  }

  const rank: AssigneeRank = VALID_RANKS.includes(assignee_rank as AssigneeRank)
    ? (assignee_rank as AssigneeRank)
    : "B";
  const mode: SupportMode = support_mode === "coaching" ? "coaching" : "efficiency";

  try {
    const overrides = await getTenantModelOverrides();
    const modelOverride = (draft.importance === "high" ? overrides.high : overrides.standard) ?? undefined;

    const ctx = await getCurrentUserContext();
    const effectiveTeamId = team_id || ctx?.teamId || null;
    let categoryOverrides: TeamCategoryOverride[] = [];
    if (effectiveTeamId) {
      const supabase = getSupabaseServer();
      const { data } = await supabase
        .from("team_categories")
        .select("team_id, major, major_label, sub, sub_label")
        .eq("team_id", effectiveTeamId);
      categoryOverrides = (data ?? []) as TeamCategoryOverride[];
    }
    const categories = flattenCategories(mergeTeamCategories(categoryOverrides));

    const result = await evaluateInstruction(draft, rank, mode, modelOverride, categories);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/evaluate]", err);
    // Routes through the client's existing 504 handler (fetchEvaluation in
    // WorkflowClient.tsx), which already shows a friendly Japanese message
    // suggesting the "通常" precision mode as a faster retry path.
    if (err instanceof APIConnectionTimeoutError) {
      return NextResponse.json({ error: "AIの応答がタイムアウトしました。" }, { status: 504 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "評価に失敗しました" },
      { status: 500 },
    );
  }
}
