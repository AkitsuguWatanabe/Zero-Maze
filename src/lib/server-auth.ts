import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Returns the current user's ID from their session cookie.
 * Returns null if not authenticated or if auth is not configured.
 * Use in API route handlers only (server-side).
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
