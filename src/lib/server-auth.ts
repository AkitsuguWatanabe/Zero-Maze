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
 * Returns the current user's tenant_id, role, and team_id from user_roles table.
 * Returns null if not authenticated or no role row found.
 */
export async function getCurrentUserContext(): Promise<{
  userId: string;
  tenantId: string;
  role: string;
  teamId: string | null;
} | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  try {
    const supabase = getSupabaseServer();
    const { data } = await supabase
      .from("user_roles")
      .select("tenant_id, role, team_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!data) return null;

    return {
      userId,
      tenantId: data.tenant_id,
      role: data.role,
      teamId: data.team_id ?? null,
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

/**
 * Returns the tenant's AI model overrides (if any), keyed by importance level.
 * Falls back to null for either field if the tenant hasn't customized it —
 * callers should fall back to the global IMPORTANCE_LABELS default in that case.
 */
export async function getTenantModelOverrides(): Promise<{
  standard: string | null;
  high: string | null;
}> {
  const tenantId = await getCurrentUserTenantId();
  if (!tenantId) return { standard: null, high: null };

  try {
    const supabase = getSupabaseServer();
    const { data } = await supabase
      .from("tenants")
      .select("openai_model_normal, openai_model_important")
      .eq("id", tenantId)
      .single();

    return {
      standard: data?.openai_model_normal || null,
      high: data?.openai_model_important || null,
    };
  } catch {
    return { standard: null, high: null };
  }
}
