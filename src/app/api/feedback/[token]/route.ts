import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { sendEmail, escapeHtml } from "@/lib/email";

/**
 * /api/feedback/[token] — 提案C（担当者からの簡易フィードバック）。
 * メール内のリンクからトークンだけで到達する公開エンドポイント（ログイン不要）。
 * トークン自体が長いランダムUUIDであり、これが実質的な認可情報となる。
 *
 * GET: フィードバック対象の指示概要と、既に回答済みかどうかを返す。
 * POST: 「わかった」／「ここが分からない」（＋任意のひとことコメント）を保存し、
 *       指示者へ通知メールを送る（18-2）。
 */

async function findInstructionByToken(token: string) {
  const supabase = getSupabaseServer();
  return supabase
    .from("instructions")
    .select("id, what, deadline, estimated_hours, feedback_status, feedback_comment, feedback_at, created_by_user_id, members(name)")
    .eq("feedback_token", token)
    .maybeSingle();
}

/**
 * 担当者が回答したことを指示者へメールで知らせる（18-2）。
 * メール失敗がフィードバック保存自体を失敗させないよう、呼び出し側でtry/catchする。
 */
async function notifyInstructor(
  supabase: ReturnType<typeof getSupabaseServer>,
  createdByUserId: string | null,
  what: string,
  assigneeName: string | null,
  status: "ok" | "unclear",
  comment: string | null,
) {
  if (!createdByUserId) return;

  const { data: userRole } = await supabase
    .from("user_roles")
    .select("email")
    .eq("user_id", createdByUserId)
    .maybeSingle();

  if (!userRole?.email) return;

  const statusLabel = status === "ok" ? "わかった" : "ここが分からない";
  const commentHtml = comment
    ? `<p style="white-space: pre-wrap;">${escapeHtml(comment)}</p>`
    : "";

  await sendEmail({
    to: userRole.email,
    subject: `【回答あり】${what.replace(/\s+/g, " ").trim().slice(0, 30)}${what.length > 30 ? "…" : ""}`,
    html: `
      <p>${assigneeName ? escapeHtml(assigneeName) : "担当者"}様から指示への回答がありました。</p>
      <p style="background: #f5f5f5; padding: 12px 16px; border-radius: 4px;">${escapeHtml(what)}</p>
      <p>回答：<strong>${statusLabel}</strong></p>
      ${commentHtml}
      <p><a href="https://app.zero-maze.com/admin/progress">進捗一覧で確認する</a></p>
    `,
  });
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
    const status = body.status as "ok" | "unclear";
    const comment = status === "unclear" ? (body.comment?.trim() || null) : null;
    const { error } = await supabase
      .from("instructions")
      .update({
        feedback_status: status,
        feedback_comment: comment,
        feedback_at: new Date().toISOString(),
      })
      .eq("feedback_token", token);

    if (error) throw new Error(error.message);

    try {
      const memberRel = existing.members as unknown as { name: string } | { name: string }[] | null;
      const assigneeName = Array.isArray(memberRel) ? memberRel[0]?.name : memberRel?.name;
      await notifyInstructor(supabase, existing.created_by_user_id, existing.what, assigneeName ?? null, status, comment);
    } catch (e) {
      console.error("[notifyInstructor]", e);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/feedback/:token]", err);
    return NextResponse.json({ error: "送信に失敗しました" }, { status: 500 });
  }
}