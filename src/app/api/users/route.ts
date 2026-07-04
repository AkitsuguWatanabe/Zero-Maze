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
  if (!ctx || !["super_admin", "tenant_admin", "team_leader"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: { email?: string; password?: string; displayName?: string; role?: string; teamId?: string | null; loginId?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { email, password, displayName, role = "member", teamId, loginId } = body ?? {};
  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "メールアドレスとパスワードは必須です" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "パスワードは8文字以上で設定してください" }, { status: 400 });
  }

  const allowedRoles = ctx.role === "super_admin"
    ? ["super_admin", "reseller_admin", "tenant_admin", "team_leader", "member"]
    : ctx.role === "team_leader"
    ? ["member"]
    : ["tenant_admin", "team_leader", "member"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "指定されたロールを付与する権限がありません" }, { status: 403 });
  }

  const effectiveTeamId = ctx.role === "team_leader" ? ctx.teamId : teamId;
  if (ctx.role === "team_leader" && !effectiveTeamId) {
    return NextResponse.json({ error: "所属チームが設定されていません" }, { status: 400 });
  }

  const trimmedLoginId = loginId?.trim();
  if (!trimmedLoginId) {
    return NextResponse.json({ error: "ログインIDは必須です" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9]+$/.test(trimmedLoginId)) {
    return NextResponse.json({ error: "ログインIDは英数字のみで入力してください" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();

    // ログインIDは企業内（同一tenant_id）でロールを問わず一意（13-3の共有プール）
    if (ctx.tenantId) {
      const { data: existing } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", ctx.tenantId)
        .eq("login_id", trimmedLoginId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { error: "そのIDは既に使用されています。別のIDを入力してください" },
          { status: 409 },
        );
      }
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim(), password, email_confirm: true,
      user_metadata: { display_name: displayName?.trim() || email.trim().split("@")[0] },
    });
    if (error) throw new Error(error.message);
    await supabase.from("user_roles").insert({
      user_id: data.user.id,
      role,
      tenant_id: ctx.tenantId,
      team_id: effectiveTeamId || null,
      login_id: trimmedLoginId,
      email: email.trim(),
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
  if (!ctx || !["super_admin", "tenant_admin", "team_leader"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  try {
    const supabase = getSupabaseServer();
    let roleQuery = supabase
      .from("user_roles")
      .select("user_id, role, team_id")
      .eq("tenant_id", ctx.tenantId);
    if (ctx.role === "team_leader") {
      roleQuery = roleQuery.eq("team_id", ctx.teamId);
    }
    const { data: roleRows } = await roleQuery;
    const userIds = (roleRows ?? []).map((r) => r.user_id);
    const roleMap = Object.fromEntries((roleRows ?? []).map((r) => [r.user_id, r.role]));
    const teamMap = Object.fromEntries((roleRows ?? []).map((r) => [r.user_id, r.team_id]));
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    const users = (data.users ?? []).filter((u) => userIds.includes(u.id)).map((u) => ({
      id: u.id, email: u.email,
      displayName: u.user_metadata?.display_name ?? u.email,
      role: roleMap[u.id] ?? "member",
      teamId: teamMap[u.id] ?? null,
      createdAt: u.created_at, lastSignIn: u.last_sign_in_at,
    }));
    return NextResponse.json(users);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "取得に失敗しました" }, { status: 500 });
  }
}

/**
 * Verify the target user belongs to the caller's tenant before allowing
 * a mutating operation (PATCH/DELETE). super_admin can act on anyone.
 */
async function assertSameTenant(
  supabase: ReturnType<typeof getSupabaseServer>,
  ctx: { role: string; tenantId: string | null },
  targetUserId: string,
) {
  if (ctx.role === "super_admin") return null;

  const { data: targetRole, error } = await supabase
    .from("user_roles")
    .select("tenant_id")
    .eq("user_id", targetUserId)
    .single();

  if (error || !targetRole || targetRole.tenant_id !== ctx.tenantId) {
    return NextResponse.json({ error: "他テナントのユーザーは操作できません" }, { status: 403 });
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "tenant_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getSupabaseServer();
  const tenantError = await assertSameTenant(supabase, ctx, id);
  if (tenantError) return tenantError;

  let body: { displayName?: string; email?: string; password?: string; role?: string; teamId?: string | null };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.password && body.password.length < 8) {
    return NextResponse.json({ error: "パスワードは8文字以上で設定してください" }, { status: 400 });
  }

  const allowedRoles = ctx.role === "super_admin"
    ? ["super_admin", "reseller_admin", "tenant_admin", "team_leader", "member"]
    : ["tenant_admin", "team_leader", "member"];
  if (body.role && !allowedRoles.includes(body.role)) {
    return NextResponse.json({ error: "指定されたロールを付与する権限がありません" }, { status: 403 });
  }

  const authUpdates: Record<string, unknown> = {};
  if (body.email?.trim()) authUpdates.email = body.email.trim();
  if (body.password) authUpdates.password = body.password;
  if (body.displayName != null) authUpdates.user_metadata = { display_name: body.displayName.trim() };

  const hasRoleUpdate = body.role !== undefined;
  const hasTeamUpdate = body.teamId !== undefined;
  const hasAuthUpdate = Object.keys(authUpdates).length > 0;

  if (!hasAuthUpdate && !hasRoleUpdate && !hasTeamUpdate) {
    return NextResponse.json({ error: "更新する項目がありません" }, { status: 400 });
  }

  try {
    let updatedUser = null;
    if (hasAuthUpdate) {
      const { data, error } = await supabase.auth.admin.updateUserById(id, authUpdates);
      if (error) throw new Error(error.message);
      updatedUser = data.user;
    }

    if (hasRoleUpdate || hasTeamUpdate) {
      const roleUpdates: Record<string, unknown> = {};
      if (hasRoleUpdate) roleUpdates.role = body.role;
      if (hasTeamUpdate) roleUpdates.team_id = body.teamId || null;
      const { error: roleError } = await supabase
        .from("user_roles")
        .update(roleUpdates)
        .eq("user_id", id);
      if (roleError) throw new Error(roleError.message);
    }

    return NextResponse.json({
      success: true,
      user: updatedUser
        ? { id: updatedUser.id, email: updatedUser.email, displayName: updatedUser.user_metadata?.display_name ?? updatedUser.email }
        : { id },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "tenant_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id === caller.id) return NextResponse.json({ error: "自分自身のアカウントは削除できません" }, { status: 400 });

  const supabase = getSupabaseServer();
  const tenantError = await assertSameTenant(supabase, ctx, id);
  if (tenantError) return tenantError;

  try {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "削除に失敗しました" }, { status: 500 });
  }
}