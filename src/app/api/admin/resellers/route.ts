import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";

/**
 * /api/admin/resellers — manage resellers (agencies that sell to tenants).
 * super_admin only.
 */

async function requireSuperAdmin() {
  const ctx = await getCurrentUserContext();
  if (!ctx || ctx.role !== "super_admin") return null;
  return ctx;
}

export async function GET() {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("resellers")
      .select("id, name, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/admin/resellers]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "代理店名は必須です" }, { status: 400 });

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase.from("resellers").insert({ name }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[POST /api/admin/resellers]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "作成に失敗しました" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "代理店名は必須です" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("resellers")
      .update({ name: body.name.trim() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PATCH /api/admin/resellers]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新に失敗しました" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireSuperAdmin();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("resellers").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/admin/resellers]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "削除に失敗しました" },
      { status: 500 },
    );
  }
}
