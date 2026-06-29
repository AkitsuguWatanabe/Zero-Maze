import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

// POST /api/users — admin-only: create a new user account.
export async function POST(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { email?: string; password?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password, displayName } = body ?? {};
  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "メールアドレスとパスワードは必須です" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "パスワードは8文字以上で設定してください" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName?.trim() || email.trim().split("@")[0],
      },
    });
    if (error) throw new Error(error.message);

    // Record role (best-effort — table may not exist).
    try {
      await supabase.from("user_roles").insert({ user_id: data.user.id, role: "user" });
    } catch { /* ignore */ }

    return NextResponse.json({ success: true, userId: data.user.id });
  } catch (err) {
    console.error("[POST /api/users]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "作成に失敗しました" },
      { status: 500 },
    );
  }
}

// GET /api/users — admin-only: list all auth users.
export async function GET() {
  const caller = await getCallerUser();
  if (!caller) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw new Error(error.message);

    const users = (data.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.user_metadata?.display_name ?? u.email,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
    }));

    return NextResponse.json(users);
  } catch (err) {
    console.error("[GET /api/users]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}

// PATCH /api/users?id=xxx — admin-only: update display name, email, or password.
export async function PATCH(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: { displayName?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.password && body.password.length < 8) {
    return NextResponse.json({ error: "パスワードは8文字以上で設定してください" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const updates: Record<string, unknown> = {};
    if (body.email?.trim())      updates.email = body.email.trim();
    if (body.password)           updates.password = body.password;
    if (body.displayName != null) {
      updates.user_metadata = { display_name: body.displayName.trim() };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "更新する項目がありません" }, { status: 400 });
    }

    const { data, error } = await supabase.auth.admin.updateUserById(id, updates);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.user_metadata?.display_name ?? data.user.email,
      },
    });
  } catch (err) {
    console.error("[PATCH /api/users]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新に失敗しました" },
      { status: 500 },
    );
  }
}

// DELETE /api/users?id=xxx — admin-only: remove a user account.
export async function DELETE(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id === caller.id) {
    return NextResponse.json({ error: "自分自身のアカウントは削除できません" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/users]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "削除に失敗しました" },
      { status: 500 },
    );
  }
}
