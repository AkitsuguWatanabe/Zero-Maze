import { NextResponse } from "next/server";
import { sendEmail, escapeHtml } from "@/lib/email";

const CONTACT_TO = process.env.CONTACT_NOTIFY_EMAIL ?? "a_watanabe@gs-group.jp";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      name?: string;
      company?: string;
      email?: string;
      phone?: string;
      message?: string;
      website?: string; // honeypot
    };

    // ハニーポット：ボットは隠しフィールドまで埋めてくることが多い
    if (body.website) {
      return NextResponse.json({ ok: true });
    }

    const name = (body.name ?? "").trim();
    const company = (body.company ?? "").trim();
    const email = (body.email ?? "").trim();
    const phone = (body.phone ?? "").trim();
    const message = (body.message ?? "").trim();

    if (!name || !email || !message) {
      return NextResponse.json({ error: "お名前・メールアドレス・お問い合わせ内容は必須です" }, { status: 400 });
    }

    const html = `
      <p>Zero-Mazeの製品紹介ページからお問い合わせがありました。</p>
      <table>
        <tr><td>お名前</td><td>${escapeHtml(name)}</td></tr>
        <tr><td>会社名</td><td>${escapeHtml(company || "（未入力）")}</td></tr>
        <tr><td>メールアドレス</td><td>${escapeHtml(email)}</td></tr>
        <tr><td>電話番号</td><td>${escapeHtml(phone || "（未入力）")}</td></tr>
      </table>
      <p>お問い合わせ内容：</p>
      <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
    `;

    await sendEmail({
      to: CONTACT_TO,
      subject: `【Zero-Maze】お問い合わせ: ${name}様`,
      html,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/contact]", err);
    return NextResponse.json({ error: "送信に失敗しました。時間をおいて再度お試しください" }, { status: 500 });
  }
}
