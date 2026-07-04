import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";

/**
 * /api/admin/teams — manage teams within a tenant.
 * super_admin: sees all teams (optionally filtered by ?tenantId=), can create/edit/delete any.
 * tenant_admin: sees only teams belonging to their own tenant, can create/edit/delete within it.
 * Everyone else: 403.
 */

async function requireAdminContext() {
  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "tenant_admin"].includes(ctx.role)) {
    return null;
  }
  return ctx;
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "tenant_admin", "team_leader"].includes(ctx.role)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  try {
    const supabase = getSupabaseServer();
    let query = supabase
      .from("teams")
      .select("id, name, tenant_id, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (ctx.role === "tenant_admin") {
      if (!ctx.tenantId) return NextResponse.json([]);
      query = query.eq("tenant_id", ctx.tenantId);
    } else if (ctx.role === "team_leader") {
      if (!ctx.teamId) return NextResponse.json([]);
      query = query.eq("id", ctx.teamId);
    } else {
      // super_admin can optionally filter by tenantId query param
      const tenantId = req.nextUrl.searchParams.get("tenantId");
      if (tenantId) query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/admin/teams]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  let body: { name?: string; tenantId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "チーム名は必須です" }, { status: 400 });

  let tenantId: string | null;
  if (ctx.role === "tenant_admin") {
    if (!ctx.tenantId) return NextResponse.json({ error: "テナントに所属していません" }, { status: 403 });
    tenantId = ctx.tenantId;
  } else {
    tenantId = body.tenantId ?? null;
    if (!tenantId) return NextResponse.json({ error: "テナントの指定が必要です" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("teams")
      .insert({ name, tenant_id: tenantId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[POST /api/admin/teams]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "作成に失敗しました" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: "チーム名は必須です" }, { status: 400 });
    updates.name = body.name.trim();
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "更新する項目がありません" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  try {
    const supabase = getSupabaseServer();
    let query = supabase.from("teams").update(updates).eq("id", id);

    if (ctx.role === "tenant_admin") {
      if (!ctx.tenantId) return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      query = query.eq("tenant_id", ctx.tenantId);
    }

    const { data, error } = await query.select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PATCH /api/admin/teams]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新に失敗しました" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const supabase = getSupabaseServer();
    let query = supabase.from("teams").delete().eq("id", id);

    if (ctx.role === "tenant_admin") {
      if (!ctx.tenantId) return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      query = query.eq("tenant_id", ctx.tenantId);
    }

    // Unassign any users from this team before deleting (avoid dangling team_id references)
    const { error: unassignError } = await supabase
      .from("user_roles")
      .update({ team_id: null })
      .eq("team_id", id);
    if (unassignError) throw new Error(unassignError.message);

    const { error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/admin/teams]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "削除に失敗しました" },
      { status: 500 },
    );
  }
}