import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Returns the current user's email, role, and tenant context.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      return NextResponse.json({ email: null, isAdmin: true, role: "tenant_admin" });
    }

    const authClient = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    });

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ email: null, isAdmin: false }, { status: 401 });

    let role = "member";
    let tenantId: string | null = null;
    let tenantName: string | null = null;
    let resellerId: string | null = null;
    let teamId: string | null = null;
    let isAdmin = false;
    let sessionTimeoutMinutes = 30;
    let activeRoleId: string | null = null;
    let hasMultipleRoles = false;
    let tenantFrozen = false;

    try {
      const supabase = getSupabaseServer();

      const { count } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      hasMultipleRoles = (count ?? 0) > 1;

      const activeCookieId = cookieStore.get("zm_active_role_id")?.value;
      let data: { id: string; role: string; tenant_id: string; team_id: string | null; reseller_id: string | null; session_timeout_minutes: number | null } | null = null;

      if (activeCookieId) {
        const { data: activeRow } = await supabase
          .from("user_roles")
          .select("id, role, tenant_id, team_id, reseller_id, session_timeout_minutes")
          .eq("id", activeCookieId)
          .eq("user_id", user.id)
          .maybeSingle();
        data = activeRow ?? null;
      }

      if (!data) {
        const { data: defaultRow } = await supabase
          .from("user_roles")
          .select("id, role, tenant_id, team_id, reseller_id, session_timeout_minutes")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();
        data = defaultRow ?? null;
      }

      if (data) {
        activeRoleId = data.id;
        role = data.role;
        tenantId = data.tenant_id;
        teamId = data.team_id ?? null;
        resellerId = data.reseller_id ?? null;
        isAdmin = ["super_admin", "reseller_admin", "tenant_admin"].includes(data.role);
        sessionTimeoutMinutes = data.session_timeout_minutes ?? 30;
      }

      if (tenantId) {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("name, frozen_at")
          .eq("id", tenantId)
          .single();
        tenantName = tenantData?.name ?? null;
        tenantFrozen = !!tenantData?.frozen_at;
      }
    } catch {
      // No role row → treat as member
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role,
      tenantId,
      tenantName,
      teamId,
      resellerId,
      isAdmin,
      sessionTimeoutMinutes,
      activeRoleId,
      hasMultipleRoles,
      tenantFrozen,
    });
  } catch (err) {
    console.error("[GET /api/me]", err);
    return NextResponse.json({ email: null, isAdmin: false }, { status: 500 });
  }
}