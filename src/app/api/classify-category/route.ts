import { NextRequest, NextResponse } from "next/server";
import { APIConnectionTimeoutError } from "openai";
import { classifyBusinessCategory } from "@/lib/evaluate-core";
import { getTenantModelOverrides, getCurrentUserContext } from "@/lib/server-auth";
import { getSupabaseServer } from "@/lib/supabase";
import { mergeTeamCategories, flattenCategories } from "@/lib/mock-data";
import type { TeamCategoryOverride } from "@/lib/mock-data";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  let body: { task_content?: string; background?: string; team_id?: string | null; importance?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { task_content, background, team_id, importance } = body ?? {};
  if (!task_content?.trim()) {
    return NextResponse.json({ error: "作業概要（task_content）は必須です" }, { status: 400 });
  }
  if (!background?.trim()) {
    return NextResponse.json({ error: "背景（background）は必須です" }, { status: 400 });
  }

  try {
    // Same team-category-override pattern as /api/evaluate.
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

    const overrides = await getTenantModelOverrides();
    const modelOverride = (importance === "high" ? overrides.high : overrides.standard) ?? undefined;

    const business_category = await classifyBusinessCategory(
      { task_content, background },
      categories,
      modelOverride,
    );
    return NextResponse.json({ business_category });
  } catch (err) {
    console.error("[/api/classify-category]", err);
    if (err instanceof APIConnectionTimeoutError) {
      return NextResponse.json({ error: "AIの応答がタイムアウトしました。" }, { status: 504 });
    }
    return NextResponse.json(
      { error: "分類中にエラーが発生しました。お手数ですが、もう一度お試しください。" },
      { status: 500 },
    );
  }
}
