import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import type { MemberProfile, CategoryRanks } from "@/lib/mock-data";

/** GET /api/members?teamId=xxx — list members belonging to the current tenant (optionally filtered by team) */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentUserContext();
    const supabase = getSupabaseServer();
    const teamId = req.nextUrl.searchParams.get("teamId");

    let query = supabase
      .from("members")
      .select("id, name, email, profile, team_id, created_at")
      .order("name");

    if (ctx?.tenantId) {
      query = query.eq("tenant_id", ctx.tenantId);
    } else if (ctx?.userId) {
      query = query.eq("user_id", ctx.userId);
    }

    if (teamId) {
      query = query.eq("team_id", teamId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const members = (data ?? []).map((m) => ({ ...m, teamId: m.team_id }));
    return NextResponse.json(members);
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
  let body: { id?: string; name: string; email?: string; profile: CategoryRanks; teamId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "名前は必須です" }, { status: 400 });
  }

  try {
    const ctx = await getCurrentUserContext();
    const supabase = getSupabaseServer();

    if (body.id) {
      const updates: Record<string, unknown> = {
        name:       body.name.trim(),
        email:      body.email ?? null,
        profile:    body.profile ?? {},
        updated_at: new Date().toISOString(),
      };
      if (body.teamId !== undefined) updates.team_id = body.teamId || null;

      let query = supabase
        .from("members")
        .update(updates)
        .eq("id", body.id);

      if (ctx?.tenantId) query = query.eq("tenant_id", ctx.tenantId);
      else if (ctx?.userId) query = query.eq("user_id", ctx.userId);

      const { data, error } = await query.select("id, name, email, profile, team_id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ...data, teamId: data.team_id } as MemberProfile & { teamId: string | null });
    } else {
      const { data, error } = await supabase
        .from("members")
        .insert({
          name:      body.name.trim(),
          email:     body.email ?? null,
          profile:   body.profile ?? {},
          user_id:   ctx?.userId ?? null,
          tenant_id: ctx?.tenantId ?? null,
          team_id:   body.teamId || null,
        })
        .select("id, name, email, profile, team_id")
        .single();

      if (error) throw new Error(error.message);
      return NextResponse.json({ ...data, teamId: data.team_id } as MemberProfile & { teamId: string | null });
    }
  } catch (err) {
    console.error("[POST /api/members]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "保存に失敗しました" },
      { status: 500 },
    );
  }
}