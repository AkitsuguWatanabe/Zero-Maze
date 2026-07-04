import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

/**
 * 13-4 新ログイン方式・第二段階：企業ID＋ログインID＋パスワードを検証し、
 * 正しい場合のみ確認画面用の表示情報（企業名・チーム名・氏名・メールアドレス）を返す。
 * ID・パスワードのどちらが誤っていても区別せず、同じエラーメッセージを返す
 * （IDの実在有無を推測されないため。13-4のログイン失敗方針に準拠）。
 * このAPI自体はセッションを確立しない。実際のログイン確定は、確認画面で
 * 「ログイン」を押した時点でクライアント側のsignIn()を呼ぶ2段階方式とする。
 */
export async function POST(req: NextRequest) {
  let body: { tenantCode?: string; loginId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantCode = body.tenantCode?.trim();
  const loginId = body.loginId?.trim();
  const password = body.password;

  const genericError = () =>
    NextResponse.json(
      { error: "企業ID・ログインID・パスワードの組み合わせが正しくありません" },
      { status: 401 },
    );

  if (!tenantCode || !loginId || !password) {
    return genericError();
  }

  try {
    const supabase = getSupabaseServer();

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, frozen_at")
      .eq("tenant_code", tenantCode)
      .maybeSingle();
    if (!tenant || tenant.frozen_at) return genericError();

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("user_id, email, role, team_id")
      .eq("tenant_id", tenant.id)
      .eq("login_id", loginId)
      .maybeSingle();
    if (!userRole || !userRole.email) return genericError();

    // パスワードの正誤判定は、Cookieを保持しない一時クライアントで行う
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return genericError();
    const tempClient = createClient(url, anonKey);
    const { error: signInError } = await tempClient.auth.signInWithPassword({
      email: userRole.email,
      password,
    });
    if (signInError) return genericError();
    await tempClient.auth.signOut();

    let teamName: string | null = null;
    if (userRole.team_id) {
      const { data: team } = await supabase
        .from("teams")
        .select("name")
        .eq("id", userRole.team_id)
        .maybeSingle();
      teamName = team?.name ?? null;
    }

    const { data: authUser } = await supabase.auth.admin.getUserById(userRole.user_id);
    const displayName = authUser?.user?.user_metadata?.display_name ?? userRole.email;

    return NextResponse.json({
      success: true,
      email: userRole.email,
      tenantName: tenant.name ?? tenantCode,
      teamName,
      displayName,
    });
  } catch {
    return genericError();
  }
}