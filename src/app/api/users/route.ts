import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCurrentUserContext } from "@/lib/server-auth";

async function getCallerUser() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const authClient = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() {},
    },
  });
  const { data: { user } } = await authClient.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "tenant_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: { email?: string; password?: string; displayName?: string; role?: string; teamId?: string | null };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { email, password, displayName, role = "member", teamId } = body ?? {};
  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "メールアドレスとパスワードは必須です" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "パスワードは8文字以上で設定してください" }, { status: 400 });
  }

  const allowedRoles = ctx.role === "super_admin"
    ? ["super_admin", "reseller_admin", "tenant_admin", "team_leader", "member"]
    : ["team_leader", "member"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "指定されたロールを付与する権限がありません" }, { status: 403 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim(), password, email_confirm: true,
      user_metadata: { display_name: displayName?.trim() || email.trim().split("@")[0] },
    });
    if (error) throw new Error(error.message);
    await supabase.from("user_roles").insert({
      user_id: data.user.id,
      role,
      tenant_id: ctx.tenantId,
      team_id: teamId || null,
    });
    return NextResponse.json({ success: true, userId: data.user.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "作成に失敗しました" }, { status: 500 });
  }
}

export async function GET() {
  const caller = await getCallerUser();
  if (!caller) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "tenant_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("user_id, role, team_id")