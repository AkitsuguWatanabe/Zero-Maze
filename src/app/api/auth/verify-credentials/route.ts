import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * 13-4 新ログイン方式・第二段階：企業ID＋ログインID＋パスワードを検証し、
 * 正しい場合のみ確認画面用の表示情報（企業名・チーム名・氏名・メールアドレス）を返す。
 * ID・パスワードのどちらが誤っていても区別せず、同じエラーメッセージを返す
 * （IDの実在有無を推測されないため。13-4のログイン失敗方針に準拠）。
 * このAPI自体はセッションを確立しない。実際のログイン確定は、確認画面で
 * 「ログイン」を押した時点でクライアント側のsignIn()を呼ぶ2段階方式とする。
 *
 * 4-5：ログイン失敗を5回連続で記録した場合、15分間ロックする（初期値・固定）。
 * 管理画面からの回数・時間調整機能は別途実装が必要なため今回はスコープ外。
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

  const lockedError = () =>
    NextResponse.json(
      { error: "ログイン失敗が続いたため、一時的にロックされています。15分ほど経ってから再度お試しください" },
      { status: 423 },
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
      .select("user_id, email, role, team_id, failed_login_count, locked_until")
      .eq("tenant_id", tenant.id)
      .eq("login_id", loginId)
      .maybeSingle();
    if (!userRole || !userRole.email) return genericError();

    if (userRole.locked_until && new Date(userRole.locked_until) > new Date()) {
      return lockedError();
    }

    // パスワードの正誤判定は、Cookieを保持しない一時クライアントで行う
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return genericError();
    const tempClient = createClient(url, anonKey);
    const { error: signInError } = await tempClient.auth.signInWithPassword({
      email: userRole.email,
      password,
    });

    if (signInError) {
      const newCount = (userRole.failed_login_count ?? 0) + 1;
      const updates: Record<string, unknown> = { failed_login_count: newCount };
      if (newCount >= MAX_FAILED_ATTEMPTS) {
        updates.locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
      }
      await supabase.from("user_roles").update(updates).eq("user_id", userRole.user_id);
      return newCount >= MAX_FAILED_ATTEMPTS ? lockedError() : genericError();
    }
    await tempClient.auth.signOut();

    // ログイン成功時はカウンターをリセット
    await supabase
      .from("user_roles")
      .update({ failed_login_count: 0, locked_until: null })
      .eq("user_id", userRole.user_id);

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