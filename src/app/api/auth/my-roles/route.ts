import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/server-auth";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "スーパー管理者",
  reseller_admin: "代理店管理者",
  tenant_admin: "テナント管理者",
  team_leader: "チームリーダー",
  member: "メンバー",
};

/**
 * 13-4 兼務対応：ログイン中ユーザーが持つ全user_roles行（チーム名・ロール名つき）を返す。
 * 1件しかない場合でも返すが、SiteHeader側では2件以上の場合のみ切り替えUIを表示する想定。
 */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "認証されていません" }, { status: 401 });

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("user_roles")
      .select("id, role, team_id, tenant_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error || !data) {
      return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
    }

    const teamIds = Array.from(new Set(data.map((r) => r.team_id).filter(Boolean))) as string[];
    let teamNames: Record<string, string> = {};
    if (teamIds.length > 0) {
      const { data: teams } = await supabase.from("teams").select("id, name").in("id", teamIds);
      teamNames = Object.fromEntries((teams ?? []).map((t) => [t.id, t.name]));
    }

    const roles = data.map((r) => ({
      id: r.id,
      role: r.role,
      roleLabel: ROLE_LABELS[r.role] ?? r.role,
      teamId: r.team_id,
      teamName: r.team_id ? (teamNames[r.team_id] ?? null) : null,
    }));

    return NextResponse.json({ roles });
  } catch {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}