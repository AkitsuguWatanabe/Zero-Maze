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
    let isAdmin = false;
    let sessionTimeoutMinutes = 30;

    try {
      const supabase = getSupabaseServer();
      const { data } = await supabase
        .from("user_roles")
        .select("role, tenant_id, reseller_id, session_timeout_minutes")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (data) {
        role = data.role;
        tenantId = data.tenant_id;
        resellerId = data.reseller_id ?? null;
        isAdmin = ["super_admin", "reseller_admin", "tenant_admin"].includes(data.role);
        sessionTimeoutMinutes = data.session_timeout_minutes ?? 30;
      }

      if (tenantId) {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", tenantId)
          .single();
        tenantName = tenantData?.name ?? null;
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
      resellerId,
      isAdmin,
      sessionTimeoutMinutes,
    });
  } catch (err) {
    console.error("[GET /api/me]", err);
    return NextResponse.json({ email: null, isAdmin: false }, { status: 500 });
  }
}