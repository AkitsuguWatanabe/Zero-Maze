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

// 最後の1人のスーパー管理者を降格・削除させない（誤操作で管理画面ごと
// アクセス不能になる事態を防ぐガード。複数人いる間は制限されない）
async function isLastSuperAdmin(
  supabase: ReturnType<typeof getSupabaseServer>,
  targetUserId: string,
): Promise<boolean> {
  const { data: targetRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .single();
  if (targetRole?.role !== "super_admin") return false;

  const { count } = await supabase
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "super_admin");
  return (count ?? 0) <= 1;
}

// 最後の1人のテナント管理者を降格させない（誤操作でテナントの管理画面ごと
// アクセス不能になる事態を防ぐガード。複数人いる間は制限されない）
async function isLastTenantAdmin(
  supabase: ReturnType<typeof getSupabaseServer>,
  targetUserId: string,
): Promise<boolean> {
  const { data: targetRole } = await supabase
    .from("user_roles")
    .select("role, tenant_id")
    .eq("user_id", targetUserId)
    .single();
  if (targetRole?.role !== "tenant_admin") return false;

  const { count } = await supabase
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "tenant_admin")
    .eq("tenant_id", targetRole.tenant_id);
  return (count ?? 0) <= 1;
}

// reseller_adminが管理できるのは自社（自分のreseller_id）配下のテナントのみ
async function getResellerTenantIds(
  supabase: ReturnType<typeof getSupabaseServer>,
  userId: string,
): Promise<string[]> {
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("reseller_id")
    .eq("user_id", userId)
    .single();
  if (!roleRow?.reseller_id) return [];
  const { data: tenantRows } = await supabase
    .from("tenants")
    .select("id")
    .eq("reseller_id", roleRow.reseller_id);
  return (tenantRows ?? []).map((t) => t.id);
}

export async function POST(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "reseller_admin", "tenant_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: { email?: string; password?: string; displayName?: string; role?: string; teamId?: string | null; loginId?: string; tenantId?: string };
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
    : ["tenant_admin", "team_leader", "member"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "指定されたロールを付与する権限がありません" }, { status: 403 });
  }

  const supabase = getSupabaseServer();

  // super_admin・reseller_adminは、どのテナントのユーザーを作るか明示的に指定する必要がある。
  // ただしsuper_admin自体はテナントに紐づかない（既存アカウントもtenant_id=null）ため対象外。
  let targetTenantId: string | null = ctx.tenantId;
  if (ctx.role === "super_admin") {
    targetTenantId = body.tenantId || null;
    if (!targetTenantId && role !== "super_admin") {
      return NextResponse.json({ error: "テナントの指定が必要です" }, { status: 400 });
    }
  } else if (ctx.role === "reseller_admin") {
    const allowedTenantIds = await getResellerTenantIds(supabase, ctx.userId);
    targetTenantId = body.tenantId ?? null;
    if (!targetTenantId || !allowedTenantIds.includes(targetTenantId)) {
      return NextResponse.json({ error: "自社配下のテナントを指定してください" }, { status: 403 });
    }
  }

  const trimmedLoginId = loginId?.trim();
  if (!trimmedLoginId) {
    return NextResponse.json({ error: "ログインIDは必須です" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9]+$/.test(trimmedLoginId)) {
    return NextResponse.json({ error: "ログインIDは英数字のみで入力してください" }, { status: 400 });
  }

  try {
    // ログインIDは企業内（同一tenant_id）でロールを問わず一意（13-3の共有プール）
    if (targetTenantId) {
      const { data: existing } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", targetTenantId)
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
      tenant_id: targetTenantId,
      team_id: teamId || null,
      login_id: trimmedLoginId,
      email: email.trim(),
    });
    return NextResponse.json({ success: true, userId: data.user.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "作成に失敗しました" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "reseller_admin", "tenant_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  try {
    const supabase = getSupabaseServer();
    const tenantIdParam = req.nextUrl.searchParams.get("tenantId");

    let roleQuery = supabase
      .from("user_roles")
      .select("user_id, role, team_id, tenant_id, session_timeout_minutes");

    if (ctx.role === "tenant_admin") {
      roleQuery = roleQuery.eq("tenant_id", ctx.tenantId);
    } else if (ctx.role === "reseller_admin") {
      const allowedTenantIds = await getResellerTenantIds(supabase, ctx.userId);
      if (tenantIdParam) {
        if (!allowedTenantIds.includes(tenantIdParam)) return NextResponse.json([]);
        roleQuery = roleQuery.eq("tenant_id", tenantIdParam);
      } else if (allowedTenantIds.length > 0) {
        roleQuery = roleQuery.in("tenant_id", allowedTenantIds);
      } else {
        return NextResponse.json([]);
      }
    } else if (tenantIdParam) {
      // super_admin: 指定があればそのテナントのみ、無ければ全テナント横断
      roleQuery = roleQuery.eq("tenant_id", tenantIdParam);
    }

    const { data: roleRows } = await roleQuery;
    const userIds = (roleRows ?? []).map((r) => r.user_id);
    const roleMap = Object.fromEntries((roleRows ?? []).map((r) => [r.user_id, r.role]));
    const teamMap = Object.fromEntries((roleRows ?? []).map((r) => [r.user_id, r.team_id]));
    const tenantMap = Object.fromEntries((roleRows ?? []).map((r) => [r.user_id, r.tenant_id]));
    const timeoutMap = Object.fromEntries(
      (roleRows ?? []).map((r) => [r.user_id, r.session_timeout_minutes ?? 30]),
    );
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    const users = (data.users ?? []).filter((u) => userIds.includes(u.id)).map((u) => ({
      id: u.id, email: u.email,
      displayName: u.user_metadata?.display_name ?? u.email,
      role: roleMap[u.id] ?? "member",
      teamId: teamMap[u.id] ?? null,
      tenantId: tenantMap[u.id] ?? null,
      sessionTimeoutMinutes: timeoutMap[u.id] ?? 30,
      createdAt: u.created_at, lastSignIn: u.last_sign_in_at,
    }));
    return NextResponse.json(users);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "取得に失敗しました" }, { status: 500 });
  }
}

/**
 * Verify the target user is within the caller's manageable scope before
 * allowing a mutating operation (PATCH/DELETE).
 * - super_admin: can act on anyone.
 * - reseller_admin: can act on users belonging to any tenant under their own reseller.
 * - tenant_admin: can act only on users within their own tenant.
 */
async function assertSameTenant(
  supabase: ReturnType<typeof getSupabaseServer>,
  ctx: { role: string; tenantId: string | null; userId: string },
  targetUserId: string,
) {
  if (ctx.role === "super_admin") return null;

  const { data: targetRole, error } = await supabase
    .from("user_roles")
    .select("tenant_id")
    .eq("user_id", targetUserId)
    .single();

  if (error || !targetRole) {
    return NextResponse.json({ error: "対象のユーザーが見つかりません" }, { status: 404 });
  }

  if (ctx.role === "reseller_admin") {
    const allowedTenantIds = await getResellerTenantIds(supabase, ctx.userId);
    if (!targetRole.tenant_id || !allowedTenantIds.includes(targetRole.tenant_id)) {
      return NextResponse.json({ error: "自社配下のテナントのユーザー以外は操作できません" }, { status: 403 });
    }
    return null;
  }

  if (targetRole.tenant_id !== ctx.tenantId) {
    return NextResponse.json({ error: "他テナントのユーザーは操作できません" }, { status: 403 });
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  const caller = await getCallerUser();
  if (!caller) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "reseller_admin", "tenant_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = getSupabaseServer();
  const tenantError = await assertSameTenant(supabase, ctx, id);
  if (tenantError) return tenantError;

  let body: {
    displayName?: string;
    email?: string;
    password?: string;
    role?: string;
    teamId?: string | null;
    tenantId?: string;
    sessionTimeoutMinutes?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (body.tenantId !== undefined && ctx.role !== "super_admin") {
    return NextResponse.json({ error: "テナントの付け替えはスーパー管理者のみ行えます" }, { status: 403 });
  }

  if (body.password && body.password.length < 8) {
    return NextResponse.json({ error: "パスワードは8文字以上で設定してください" }, { status: 400 });
  }

  if (body.sessionTimeoutMinutes !== undefined) {
    // セッションタイムアウトの調整は当社（super_admin）のみに限定する（13-4の方針）
    if (ctx.role !== "super_admin") {
      return NextResponse.json(
        { error: "セッションタイムアウトの変更はスーパー管理者のみ行えます" },
        { status: 403 },
      );
    }
    const minutes = Number(body.sessionTimeoutMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480) {
      return NextResponse.json(
        { error: "セッションタイムアウトは5〜480分の範囲で指定してください" },
        { status: 400 },
      );
    }
  }

  const allowedRoles = ctx.role === "super_admin"
    ? ["super_admin", "reseller_admin", "tenant_admin", "team_leader", "member"]
    : ["tenant_admin", "team_leader", "member"];
  if (body.role && !allowedRoles.includes(body.role)) {
    return NextResponse.json({ error: "指定されたロールを付与する権限がありません" }, { status: 403 });
  }

  if (body.role !== undefined && body.role !== "super_admin" && (await isLastSuperAdmin(supabase, id))) {
    return NextResponse.json(
      { error: "最後のスーパー管理者のロールは変更できません。先に別のスーパー管理者アカウントを作成してください" },
      { status: 400 },
    );
  }

  if (body.role !== undefined && body.role !== "tenant_admin" && (await isLastTenantAdmin(supabase, id))) {
    return NextResponse.json(
      { error: "最後のテナント管理者のロールは変更できません。先に別のテナント管理者アカウントを作成してください" },
      { status: 400 },
    );
  }

  const authUpdates: Record<string, unknown> = {};
  if (body.email?.trim()) authUpdates.email = body.email.trim();
  if (body.password) authUpdates.password = body.password;
  if (body.displayName != null) authUpdates.user_metadata = { display_name: body.displayName.trim() };

  const hasRoleUpdate = body.role !== undefined;
  const hasTeamUpdate = body.teamId !== undefined;
  const hasTenantUpdate = body.tenantId !== undefined;
  const hasTimeoutUpdate = body.sessionTimeoutMinutes !== undefined;
  const hasAuthUpdate = Object.keys(authUpdates).length > 0;

  if (!hasAuthUpdate && !hasRoleUpdate && !hasTeamUpdate && !hasTenantUpdate && !hasTimeoutUpdate) {
    return NextResponse.json({ error: "更新する項目がありません" }, { status: 400 });
  }

  try {
    let updatedUser = null;
    if (hasAuthUpdate) {
      const { data, error } = await supabase.auth.admin.updateUserById(id, authUpdates);
      if (error) throw new Error(error.message);
      updatedUser = data.user;
    }

    if (hasRoleUpdate || hasTeamUpdate || hasTenantUpdate || hasTimeoutUpdate) {
      const roleUpdates: Record<string, unknown> = {};
      if (hasRoleUpdate) roleUpdates.role = body.role;
      if (hasTeamUpdate) roleUpdates.team_id = body.teamId || null;
      if (hasTenantUpdate) roleUpdates.tenant_id = body.tenantId || null;
      if (hasTimeoutUpdate) roleUpdates.session_timeout_minutes = body.sessionTimeoutMinutes;
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
  if (!ctx || !["super_admin", "reseller_admin", "tenant_admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id === caller.id) return NextResponse.json({ error: "自分自身のアカウントは削除できません" }, { status: 400 });

  const supabase = getSupabaseServer();
  const tenantError = await assertSameTenant(supabase, ctx, id);
  if (tenantError) return tenantError;

  if (await isLastSuperAdmin(supabase, id)) {
    return NextResponse.json({ error: "最後のスーパー管理者は削除できません" }, { status: 400 });
  }

  const FALLBACK_DELETE_ERROR =
    "削除に失敗しました。指示データ等、このユーザーに紐づく情報が残っている可能性があります（データベースの参照制約により、関連データを先に削除する必要がある場合があります）";

  // SupabaseのAuthErrorは、GoTrore側のレスポンス形式によってはmessageが
  // 空のJSON文字列（"{}"等）になることがあり、そのまま使うと画面に無意味な
  // 文字列が表示されてしまう。中身のないメッセージは分かりやすい文言に差し替える。
  function isUselessErrorMessage(msg: string | undefined): boolean {
    const trimmed = msg?.trim();
    if (!trimmed) return true;
    return trimmed.startsWith("{") && trimmed.endsWith("}");
  }

  try {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) {
      console.error("[DELETE /api/admin/users] deleteUser failed", JSON.stringify(error), error);
      throw new Error(isUselessErrorMessage(error.message) ? FALLBACK_DELETE_ERROR : error.message);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/admin/users]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error && !isUselessErrorMessage(err.message)
            ? err.message
            : FALLBACK_DELETE_ERROR,
      },
      { status: 500 },
    );
  }
}