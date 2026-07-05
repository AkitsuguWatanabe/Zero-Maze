import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

/**
 * 企業ID＋メールアドレスから、該当するログインIDをメールで案内する。
 * ログインIDはSupabase Authの管理外（独自カラム）のため、Supabase標準の
 * パスワード再発行機能は使えず、Resend APIを直接呼んで送信する。
 * 未認証から呼ばれる公開エンドポイントのため、13-4の方針に従い、
 * 該当ユーザーが見つかっても見つからなくても常に同じレスポンスを返し、
 * 実在有無を推測されないようにする。
 */
export async function POST(req: NextRequest) {
  let body: { tenantCode?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantCode = body.tenantCode?.trim();
  const email = body.email?.trim();

  if (!tenantCode || !email) {
    return NextResponse.json({ sent: true });
  }

  try {
    const supabase = getSupabaseServer();

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, frozen_at")
      .eq("tenant_code", tenantCode)
      .maybeSingle();

    // 企業IDが存在しない、または凍結中の場合も、常に同じ「送信しました」を返す
    if (!tenant || tenant.frozen_at) {
      return NextResponse.json({ sent: true });
    }

    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("login_id")
      .eq("tenant_id", tenant.id)
      .ilike("email", email);

    const loginIds = Array.from(
      new Set((userRoles ?? []).map((r) => r.login_id).filter(Boolean)),
    );

    // 該当が無ければ、メールを送らずに「送信しました」とだけ返す
    if (loginIds.length === 0) {
      return NextResponse.json({ sent: true });
    }

    const loginIdListHtml = loginIds.map((id) => `<li>${id}</li>`).join("");

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Zero-Maze <noreply@zero-maze.com>",
        to: email,
        subject: "ログインIDのご案内",
        html: `
          <p>${tenant.name} 様</p>
          <p>ご登録のログインIDは以下の通りです。</p>
          <ul>${loginIdListHtml}</ul>
          <p>企業ID: ${tenantCode}</p>
          <p>心当たりのない場合は、このメールを無視してください。</p>
        `,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error("Resend send error:", errText);
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error("request-login-id error:", err);
    // エラー時も存在有無を推測されないよう、失敗の詳細は返さない
    return NextResponse.json({ sent: true });
  }
}