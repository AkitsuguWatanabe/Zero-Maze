import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";

/**
 * GET /api/admin/users?tenantId=xxx
 * super_admin: can list users for any tenant (or all, if no tenantId given).
 * reseller_admin: can list users only for tenants under their reseller.
 * Role + tenant assignment changes happen here (separate from /api/users,
 * which is scoped to the caller's own tenant for tenant_admin use).
 */

async function requireAdminContext() {
  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "reseller_admin"].includes(ctx.role)) return null;
  return ctx;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  const tenantId = req.nextUrl.searchParams.get("tenantId");

  try {
    const supabase = getSupabaseServer();

    let allowedTenantIds: string[] | null = null;
    if (ctx.role === "reseller_admin") {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("reseller_id")
        .eq("user_id", ctx.userId)
        .single();
      if (!roleRow?.reseller_id) return NextResponse.json([]);

      const { data: tenants } = await supabase
        .from("tenants")
        .select("id")
        .eq("reseller_id", roleRow.reseller_id);
      allowedTenantIds = (tenants ?? []).map((t) => t.id);
      if (tenantId && !allowedTenantIds.includes(tenantId)) {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
    }

    let roleQuery = supabase.from("user_roles").select("user_id, role, tenant_id");
    if (tenantId) {
      roleQuery = roleQuery.eq("tenant_id", tenantId);
    } else if (allowedTenantIds) {
      roleQuery = roleQuery.in("tenant_id", allowedTenantIds);
    }
    const { data: roleRows } = await roleQuery;

    const userIds = (roleRows ?? []).map((r) => r.user_id);
    const roleMap = Object.fromEntries((roleRows ?? []).map((r) => [r.user_id, r.role]));
    const tenantMap = Object.fromEntries((roleRows ?? []).map((r) => [r.user_id, r.tenant_id]));

    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw new Error(error.message);

    const users = (data.users ?? [])
      .filter((u) => userIds.includes(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.user_metadata?.display_name ?? u.email,
        role: roleMap[u.id] ?? "member",
        tenantId: tenantMap[u.id] ?? null,
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at,
      }));

    return NextResponse.json(users);
  } catch (err) {
    console.error("[GET /api/admin/users]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}

/** PATCH /api/admin/users?id=xxx — change a user's role and/or tenant assignment */
export async function PATCH(req: NextRequest) {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: { role?: string; tenantId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const allowedRoles =
    ctx.role === "super_admin"
      ? ["super_admin", "reseller_admin", "tenant_admin", "team_leader", "member"]
      : ["tenant_admin", "team_leader", "member"];

  if (body.role && !allowedRoles.includes(body.role)) {
    return NextResponse.json({ error: "指定されたロールを付与する権限がありません" }, { status: 403 });
  }

  try {
    const supabase = getSupabaseServer();
    const updates: Record<string, unknown> = {};
    if (body.role) updates.role = body.role;
    if (body.tenantId) updates.tenant_id = body.tenantId;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "更新する項目がありません" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_roles")
      .update(updates)
      .eq("user_id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, userRole: data });
  } catch (err) {
    console.error("[PATCH /api/admin/users]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新に失敗しました" },
      { status: 500 },
    );
  }
}