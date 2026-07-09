import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase招待・パスワード再設定メールのリンク着地点。
 * このプロジェクトはメールリンクにPKCE形式（?code=...）を使っており、
 * ブラウザ側のクライアントがハッシュ断片から自動でセッションを確立する
 * 旧方式（implicit flow）とは異なり、サーバー側でcodeをセッションに
 * 交換してCookieへ保存する必要がある。これが無いと、招待・パスワード
 * 再設定メールのリンクをクリックしてもセッションが確立されず、
 * /update-passwordでのパスワード変更が保存されないまま失敗する。
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/update-password";

  if (!code) {
    return NextResponse.redirect(`${origin}/update-password`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.redirect(`${origin}/update-password`);
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[GET /auth/callback] exchangeCodeForSession failed", error);
    return NextResponse.redirect(`${origin}/update-password?linkError=1`);
  }

  return response;
}
