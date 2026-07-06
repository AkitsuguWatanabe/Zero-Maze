import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

/**
 * /api/feedback/[token] — 提案C（担当者からの簡易フィードバック）。
 * メール内のリンクからトークンだけで到達する公開エンドポイント（ログイン不要）。
 * トークン自体が長いランダムUUIDであり、これが実質的な認可情報となる。
 *
 * GET: フィードバック対象の指示概要と、既に回答済みかどうかを返す。
 * POST: 「わかった」／「ここが分からない」（＋任意のひとことコメント）を保存する。
 */

async function findInstructionByToken(token: string) {
  const supabase = getSupabaseServer();
  return supabase
    .from("instructions")
    .select("id, what, deadline, estimated_hours, feedback_status, feedback_comment, feedback_at, members(name)")
    .eq("feedback_token", token)
    .maybeSingle();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const { data, error } = await findInstructionByToken(token);
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "リンクが無効です" }, { status: 404 });

    const memberRel = data.members as unknown as { name: string } | { name: string }[] | null;
    const assigneeName = Array.isArray(memberRel) ? memberRel[0]?.name : memberRel?.name;

    return NextResponse.json({
      what: data.what,
      deadline: data.deadline,
      estimatedHours: data.estimated_hours,
      assigneeName: assigneeName ?? null,
      feedbackStatus: data.feedback_status ?? null,
      feedbackComment: data.feedback_comment ?? null,
    });
  } catch (err) {
    console.error("[GET /api/feedback/:token]", err);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: { status?: string; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.status !== "ok" && body.status !== "unclear") {
    return NextResponse.json({ error: "statusが不正です" }, { status: 400 });
  }

  try {
    const { data: existing, error: findError } = await findInstructionByToken(token);
    if (findError) throw new Error(findError.message);
    if (!existing) return NextResponse.json({ error: "リンクが無効です" }, { status: 404 });

    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("instructions")
      .update({
        feedback_status: body.status,
        feedback_comment: body.status === "unclear" ? (body.comment?.trim() || null) : null,
        feedback_at: new Date().toISOString(),
      })
      .eq("feedback_token", token);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/feedback/:token]", err);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}