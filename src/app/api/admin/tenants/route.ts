import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import { randomUUID } from "crypto";

/**
 * /api/admin/tenants — manage tenants (companies using the system).
 * super_admin: sees all tenants, can create/edit/delete any.
 * reseller_admin: sees only tenants belonging to their reseller, can create/edit (not delete).
 * Everyone else: 403.
 */

async function requireAdminContext() {
  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "reseller_admin"].includes(ctx.role)) {
    return null;
  }
  return ctx;
}

export async function GET() {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  try {
    const supabase = getSupabaseServer();
    let query = supabase
      .from("tenants")
      .select("id, name, slug, reseller_id, status, google_sheet_id, openai_model_normal, openai_model_important, created_at")
      .order("created_at", { ascending: false });

    if (ctx.role === "reseller_admin") {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("reseller_id")
        .eq("user_id", ctx.userId)
        .single();
      if (!roleRow?.reseller_id) return NextResponse.json([]);
      query = query.eq("reseller_id", roleRow.reseller_id);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/admin/tenants]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  let body: { name?: string; resellerId?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "テナント名は必須です" }, { status: 400 });

  try {
    const supabase = getSupabaseServer();

    let resellerId = body.resellerId ?? null;
    if (ctx.role === "reseller_admin") {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("reseller_id")
        .eq("user_id", ctx.userId)
        .single();
      resellerId = roleRow?.reseller_id ?? null;
    }

    const insertData: Record<string, unknown> = { name, reseller_id: resellerId };
    const providedSlug = body.slug?.trim();
    if (providedSlug) {
      insertData.slug = providedSlug;
    } else {
      const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      insertData.slug = `${base || "tenant"}-${randomUUID().slice(0, 8)}`;
    }

    const { data, error } = await supabase
      .from("tenants")
      .insert(insertData)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[POST /api/admin/tenants]", err);
    return NextResponse.json(
      {