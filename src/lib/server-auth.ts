import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabase";

/**
 * Returns the current user's ID from their session cookie.
 * Returns null if not authenticated or if auth is not configured.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() { /* read-only in API routes */ },
    },
  });

  const { data: { user } } = await client.auth.getUser();
  return user?.id ?? null;
}

/**
 * Returns the current user's tenant_id and role from user_roles table.
 * Returns null if not authenticated or no role row found.
 */
export async function getCurrentUserContext(): Promise<{
  userId: string;
  tenantId: string;
  role: string;
} | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  try {
    const supabase = getSupabaseServer();
    const { data } = await supabase
      .from("user_roles")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .not("tenant_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!data?.tenant_id) return null;

    return {
      userId,
      tenantId: data.tenant_id,
      role: data.role,
    };
  } catch {
    return null;
  }
}

/**
 * Returns the current user's tenant_id only (convenience wrapper).
 */
export async function getCurrentUserTenantId(): Promise<string | null> {
  const ctx = await getCurrentUserContext();
  return ctx?.tenantId ?? null;
}
