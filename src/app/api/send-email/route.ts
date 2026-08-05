import { NextRequest, NextResponse } from "next/server";
import { sendEmail, escapeHtml } from "@/lib/email";
import { getCurrentUser } from "@/lib/server-auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured" }, { status: 500 });
  }

  const auth = await getCurrentUser();
  if (!auth) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { final_instruction?: string; subject_label?: string; to?: string; feedback_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const finalInstruction = body?.final_instruction?.trim();
  if (!finalInstruction) {
    return NextResponse.json({ error: "final_instruction は必須です" }, { status: 400 });
  }
  // Defensive strip: the model is instructed never to include a trailing
  // request-suffix in subject_label, but if it slips one in anyway, drop it
  // here so the subject we build below doesn't end up duplicated
  // (e.g. 「議事録作成に関する依頼に関する依頼」).
  const subjectLabel =
    body?.subject_label
      ?.trim()
      .replace(/(について|に関する|の件|依頼|お願い)+$/u, "")
      .trim() || "業務";

  const requestedTo = body?.to?.trim();
  const recipient = requestedTo || auth.email;
  if (!recipient) {
    return NextResponse.json({ error: "送信先メールアドレスが取得できませんでした" }, { status: 400 });
  }
  if (requestedTo && !EMAIL_PATTERN.test(requestedTo)) {
    return NextResponse.json({ error: "メールアドレスの形式が正しくありません" }, { status: 400 });
  }

  // A send with an explicit `to` is going to the assignee, not the sender's
  // own inbox — frame it as a real email (greeting + closing) rather than
  // dropping the bare internal-memo text on them.
  const bodyText = requestedTo
    ? `お疲れ様です。\n\n以下の内容で対応をお願いいたします。\n\n${finalInstruction}\n\nよろしくお願いいたします。`
    : finalInstruction;

  // 21-1: 「承知しました／確認させてください」を一言だけ返せるリンク。
  // 担当者宛（requestedToあり）の送信でのみ付与する。トークン自体が
  // 認可情報のため、ログイン不要の公開ページ（/feedback/[token]）で受け付ける。
  const feedbackLinkHtml = requestedTo && body.feedback_token
    ? `<p><a href="https://app.zero-maze.com/feedback/${body.feedback_token}">こちらから「承知しました／確認させてください」を返す</a></p>`
    : "";

  const html = `<div style="white-space:pre-wrap;font-family:sans-serif;font-size:14px;line-height:1.7;">${escapeHtml(bodyText)}</div>${feedbackLinkHtml}`;

  try {
    const sent = await sendEmail({
      to: recipient,
      subject: `${subjectLabel}に関する依頼`,
      html,
    });
    if (!sent) {
      return NextResponse.json({ error: "メールの送信に失敗しました" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/send-email]", err);
    return NextResponse.json(
      { error: "メールの送信に失敗しました" },
      { status: 502 },
    );
  }
}
