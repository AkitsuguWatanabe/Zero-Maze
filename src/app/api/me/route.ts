import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Returns the current user's email + admin status.
// Admin is determined by the `user_roles` table (role = 'admin').
// If the table doesn't exist yet, all authenticated users are treated as admin
// so existing deployments don't break.
export async function GET() {
  try {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      // No auth configured — return pseudo-admin so the app still works.
      return NextResponse.json({ email: null, isAdmin: true });
    }

    const authClient = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only in this context */ },
      },
    });

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ email: null, isAdmin: false }, { status: 401 });

    // Check admin role via service-role client (bypasses RLS).
    let isAdmin = true; // default to admin if table doesn't exist
    try {
      const supabase = getSupabaseServer();
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();
      if (data) {
        isAdmin = data.role === "admin";
      }
      // If no row found, keep default (true) — unregistered users treated as admin
    } catch {
      // Table doesn't exist → treat all users as admin for backward compat
    }

    return NextResponse.json({ id: user.id, email: user.email, isAdmin });
  } catch (err) {
    console.error("[GET /api/me]", err);
    return NextResponse.json({ email: null, isAdmin: false }, { status: 500 });
  }
}
