import { NextRequest, NextResponse } from "next/server";
import { evaluateInstruction } from "@/lib/evaluate-core";
import { getTenantModelOverrides, getCurrentUserContext } from "@/lib/server-auth";
import { getSupabaseServer } from "@/lib/supabase";
import { mergeTeamCategories, flattenCategories } from "@/lib/mock-data";
import type { InstructionDraft, AssigneeRank, SupportMode, TeamCategoryOverride } from "@/lib/mock-data";

const VALID_RANKS: AssigneeRank[] = ["A", "B", "C", "D"];

// gpt-5.5 reasoning can take 40-80s. Vercel Pro allows up to 300s; set 120s as a safe ceiling.
// Note: Vercel Hobby plan caps at 10s regardless of this value — upgrade to Pro if 504 persists.
export const maxDuration = 120;

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "評価に失敗しました" },
      { status: 500 },
    );
  }
}
