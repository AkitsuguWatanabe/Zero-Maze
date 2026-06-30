import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import type { MemberProfile, CategoryRanks } from "@/lib/mock-data";

/** GET /api/members — list members belonging to the current tenant */
export async function GET() {
  try {
    const ctx = await getCurrentUserContext();
    const supabase = getSupabaseServer();

    let query = supabase
      .from("members")
      .select("id, name, email, profile, created_at")
      .order("name");

    if (ctx?.tenantId) {
      query = query.eq("tenant_id", ctx.tenantId);
    } else if (ctx?.userId) {
      query = query.eq("user_id", ctx.userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/members]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}

/** DELETE /api/members?id=xxx */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const ctx = await getCurrentUserContext();
    const supabase = getSupabaseServer();

    let query = supabase.from("members").delete().eq("id", id);
    if (ctx?.tenantId) {
      query = query.eq("tenant_id", ctx.tenantId);
    } else if (ctx?.userId) {
      query = query.eq("user_id", ctx.userId);
    }

    const { error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/members]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "削除に失敗しました" },
      { status: 500 },
    );
  }
}

/** POST /api/members — create or update a member */
export async function POST(req: NextRequest) {
  let body: { id?: string; name: string; email?: string; profile: CategoryRanks };
  try {
    body = await req.json();
  }
