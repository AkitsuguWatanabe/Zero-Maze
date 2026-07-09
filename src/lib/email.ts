/**
 * Resend APIを直接fetchで呼ぶ共通ヘルパー。SDK不使用（既存の実装パターンを踏襲）。
 * Vercelのサーバーレス実行はレスポンス送出後に打ち切られることがあるため、
 * 呼び出し側は必ずawaitすること（fire-and-forgetにしない）。
 */
export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<void> {
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
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
