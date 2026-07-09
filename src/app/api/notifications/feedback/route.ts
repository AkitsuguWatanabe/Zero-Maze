import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";

/**
 * /api/notifications/feedback — 自分（指示者）が作成した指示のうち、
 * 担当者からの回答があってまだ確認していないものを扱う（18-2）。
 */

export async function GET() {
  const ctx = await getCurrentUserContext();
  if (!ctx?.userId) return NextResponse.json([], { status: 200 });

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("instructions")
      .select("id, what, assignee_name, feedback_status, feedback_comment, feedback_at")
      .eq("created_by_user_id", ctx.userId)
      .not("feedback_status", "is", null)
      .is("feedback_acknowledged_at", null)
      .order("feedback_at", { ascending: false });

    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/notifications/feedback]", err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserContext();
  if (!ctx?.userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ success: true });

  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("instructions")
      .update({ feedback_acknowledged_at: new Date().toISOString() })
      .in("id", ids)
      .eq("created_by_user_id", ctx.userId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/notifications/feedback]", err);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
