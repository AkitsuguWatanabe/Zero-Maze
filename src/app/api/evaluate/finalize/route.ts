import { NextRequest, NextResponse } from "next/server";
import { APIConnectionTimeoutError } from "openai";
import { generateFinalInstruction } from "@/lib/evaluate-core";
import { getTenantModelOverrides, getCurrentUserContext } from "@/lib/server-auth";
import { getSupabaseServer } from "@/lib/supabase";
import { mergeTeamCategories, flattenCategories } from "@/lib/mock-data";
import type { InstructionDraft, AssigneeRank, SupportMode, TeamCategoryOverride } from "@/lib/mock-data";

const VALID_RANKS: AssigneeRank[] = ["A", "B", "C", "D"];

// /api/evaluateで合格した評価に対してのみ呼ばれる、最終指示文
// （final_instruction・milestones）生成専用エンドポイント。評価スコアの
// 算出はやり直さず、ここだけを叩き直せる（WorkflowClient.tsx側の
// 「完成指示文を生成する」再試行ボタンにも流用可能）。
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

    const final = await generateFinalInstruction(draft, rank, mode, modelOverride, categories);
    return NextResponse.json(final);
  } catch (err) {
    console.error("[/api/evaluate/finalize]", err);
    if (err instanceof APIConnectionTimeoutError) {
      return NextResponse.json({ error: "AIの応答がタイムアウトしました。" }, { status: 504 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "完成指示文の生成に失敗しました" },
      { status: 500 },
    );
  }
}
