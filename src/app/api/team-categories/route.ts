import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import type { TeamCategoryOverride } from "@/lib/mock-data";

const VALID_MAJORS = ["1", "2", "3", "4"];
const VALID_SUBS = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2"];

/**
 * /api/team-categories — per-team labels for the 8 fixed business-category slots.
 * The slot structure (major/sub keys) is global and fixed; only the label text is
 * customizable per team. Falls back to the global default (empty result) when a
 * team hasn't customized any labels — callers apply mergeTeamCategories() themselves.
 */

/** Confirms the requester may read/write the given team's categories. Returns null if not. */
async function resolveTeamAccess(teamId: string) {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  if (ctx.role === "team_leader") {
    return ctx.teamId === teamId ? ctx : null;
  }
  if (ctx.role === "super_admin") {
    return ctx;
  }
  if (ctx.role === "tenant_admin" || ctx.role === "reseller_admin") {
    if (!ctx.tenantId) return null;
    const supabase = getSupabaseServer();
    const { data } = await supabase.from("teams").select("tenant_id").eq("id", teamId).single();
    return data?.tenant_id === ctx.tenantId ? ctx : null;
  }
  // plain "member" — no read access to team category management
  return null;
}

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

  const ctx = await resolveTeamAccess(teamId);
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("team_categories")
      .select("team_id, major, major_label, sub, sub_label")
      .eq("team_id", teamId);
    if (error) throw new Error(error.message);
    return NextResponse.json((data ?? []) as TeamCategoryOverride[]);
  } catch (err) {
    console.error("[GET /api/team-categories]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: { teamId?: string; categories?: TeamCategoryOverride[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const teamId = body.teamId;
  const categories = body.categories;
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });
  if (!Array.isArray(categories) || categories.length === 0) {
    return NextResponse.json({ error: "categories is required" }, { status: 400 });
  }
  for (const c of categories) {
    if (!VALID_MAJORS.includes(c.major) || !VALID_SUBS.includes(c.sub)) {
      return NextResponse.json({ error: `不正なカテゴリキーです: ${c.sub}` }, { status: 400 });
    }
    if (!c.major_label?.trim() || !c.sub_label?.trim()) {
      return NextResponse.json({ error: "ラベルは空にできません" }, { status: 400 });
    }
  }

  const ctx = await resolveTeamAccess(teamId);
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  try {
    const supabase = getSupabaseServer();
    const rows = categories.map((c) => ({
      team_id: teamId,
      major: c.major,
      major_label: c.major_label.trim(),
      sub: c.sub,
      sub_label: c.sub_label.trim(),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("team_categories").upsert(rows, { onConflict: "team_id,sub" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/team-categories]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "保存に失敗しました" },
      { status: 500 },
    );
  }
}
