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
      setAll() { /* read-only */ },
    },
  });
  const { data: { user } } = await authClient.auth.getUser();
  return user;
}

// POST /api/users — tenant_admin以上: 同一テナント内に新規ユーザーを作成
export async function POST(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "tenant_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: { email?: string; password?: string; displayName?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password, displayName, role = "member" } = body ?? {};
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
    return NextResponse.json({ error: "指定されたロールを付与する権限がありません" }, { status:
