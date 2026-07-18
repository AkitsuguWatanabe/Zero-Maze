/**
 * Resend APIを直接fetchで呼ぶ共通ヘルパー。SDK不使用（既存の実装パターンを踏襲）。
 * Vercelのサーバーレス実行はレスポンス送出後に打ち切られることがあるため、
 * 呼び出し側は必ずawaitすること（fire-and-forgetにしない）。
 * 戻り値は送信成否（true/false）。失敗してもthrowはしない — 既存の呼び出し元は
 * 戻り値を見ずfire-and-forget的に使っているため、その挙動を変えないための設計。
 * 成否を呼び出し元に伝えたい場合は戻り値を確認すること。
 */
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Zero-Maze <noreply@zero-maze.com>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error("[sendEmail] Resend error:", await res.text());
    return false;
  }
  return true;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
