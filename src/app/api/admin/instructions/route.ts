import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";

/**
 * /api/admin/instructions — 16-1①の切り分け（提案B簡易版）。
 * 「誰にどの指示を出し、送信から何日経過しているか」を一覧で返す。
 * 完了/未着手のステータスは担当者機能が無いため今回のスコープ外（提案Bの本格版で対応）。
 *
 * tenant_admin: 自テナント全体（ヘッダーのチーム選択で絞り込み可）。
 * team_leader: 自チームのみ。
 * super_admin: 全テナント横断（任意でtenantIdによる絞り込み可）。
 * reseller_admin: 自社が扱う顧客テナントの範囲で横断（同様に絞り込み可）（19-3）。
 * それ以外（member等）: 403。
 */
export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !["tenant_admin", "team_leader", "super_admin", "reseller_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  try {
    const supabase = getSupabaseServer();
    let query = supabase
      .from("instructions")
      .select("id, created_at, what, assignee_id, team_id, tenant_id, feedback_status, feedback_comment, members(name), teams(name), tenants(name)")
      .not("assignee_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    const tenantIdParam = req.nextUrl.searchParams.get("tenantId");

    if (ctx.role === "tenant_admin") {
      if (!ctx.tenantId) return NextResponse.json([]);
      query = query.eq("tenant_id", ctx.tenantId);

      const teamId = req.nextUrl.searchParams.get("teamId");
      if (teamId) query = query.eq("team_id", teamId);
    } else if (ctx.role === "team_leader") {
      if (!ctx.teamId) return NextResponse.json([]);
      query = query.eq("team_id", ctx.teamId);
    } else if (ctx.role === "reseller_admin") {
      // 自社が扱う顧客テナントのみに限定する
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("reseller_id")
        .eq("user_id", ctx.userId)
        .single();
      if (!roleRow?.reseller_id) return NextResponse.json([]);

      const { data: tenantRows } = await supabase
        .from("tenants")
        .select("id")
        .eq("reseller_id", roleRow.reseller_id);
      const tenantIds = (tenantRows ?? []).map((t) => t.id);
      if (tenantIds.length === 0) return NextResponse.json([]);
      query = query.in("tenant_id", tenantIds);

      if (tenantIdParam) query = query.eq("tenant_id", tenantIdParam);
    } else {
      // super_admin: 全テナント横断。任意でtenantIdによる絞り込み。
      if (tenantIdParam) query = query.eq("tenant_id", tenantIdParam);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const now = Date.now();
    const items = (data ?? []).map((row) => {
      const createdAt = row.created_at as string;
      const daysElapsed = Math.floor((now - new Date(createdAt).getTime()) / 86_400_000);
      // Supabase's typed FK-join returns an object here (single relation), but the
      // generated types can widen it to an array — normalize defensively either way.
      const memberRel = row.members as unknown as { name: string } | { name: string }[] | null;
      const teamRel = row.teams as unknown as { name: string } | { name: string }[] | null;
      const tenantRel = row.tenants as unknown as { name: string } | { name: string }[] | null;
      const assigneeName = Array.isArray(memberRel) ? memberRel[0]?.name : memberRel?.name;
      const teamName = Array.isArray(teamRel) ? teamRel[0]?.name : teamRel?.name;
      const tenantName = Array.isArray(tenantRel) ? tenantRel[0]?.name : tenantRel?.name;

      return {
        id: row.id,
        what: row.what,
        createdAt,
        daysElapsed,
        assigneeName: assigneeName ?? "(不明)",
        teamName: teamName ?? null,
        tenantName: tenantName ?? null,
        feedbackStatus: (row.feedback_status as "ok" | "unclear" | null) ?? null,
        feedbackComment: (row.feedback_comment as string | null) ?? null,
      };
    });

    return NextResponse.json(items);
  } catch (err) {
    console.error("[GET /api/admin/instructions]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}