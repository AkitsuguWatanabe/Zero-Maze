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
      .select("id, name, quota_limit, quota_used, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // 代理店ごとのテナント数・凍結中件数を集計（発行状況の可視化用）
    const { data: tenantRows } = await supabase
      .from("tenants")
      .select("reseller_id, frozen_at");

    const withCounts = (data ?? []).map((r) => {
      const forThisReseller = (tenantRows ?? []).filter((t) => t.reseller_id === r.id);
      return {
        ...r,
        tenant_count: forThisReseller.length,
        frozen_count: forThisReseller.filter((t) => t.frozen_at).length,
      };
    });

    return NextResponse.json(withCounts);
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

  let body: { name?: string; quotaIncrement?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: "代理店名は必須です" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updates.name = body.name.trim();
    }

    if (body.quotaIncrement !== undefined) {
      const increment = Number(body.quotaIncrement);
      if (!Number.isFinite(increment) || increment <= 0) {
        return NextResponse.json({ error: "増枠数が不正です" }, { status: 400 });
      }
      const { data: current, error: fetchError } = await supabase
        .from("resellers")
        .select("quota_limit")
        .eq("id", id)
        .single();
      if (fetchError || !current) {
        return NextResponse.json({ error: "代理店情報の取得に失敗しました" }, { status: 500 });
      }
      updates.quota_limit = current.quota_limit + increment;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "更新する項目がありません" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("resellers")
      .update(updates)
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