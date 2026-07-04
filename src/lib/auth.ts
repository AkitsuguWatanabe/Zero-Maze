"use client";
/**
 * Auth helpers — client-side only (uses NEXT_PUBLIC_ anon key).
 * Import only in "use client" components or client-side context.
 */
import { getSupabaseBrowser } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export type AuthUser = Pick<User, "id" | "email"> & {
  display_name?: string;
};

export async function signIn(email: string, password: string) {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.user;
}

export async function signOut() {
  const sb = getSupabaseBrowser();
  await sb.auth.signOut();
}

export async function getSession() {
  const sb = getSupabaseBrowser();
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<AuthUser | null> {
  const sb = getSupabaseBrowser();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    display_name: data.user.user_metadata?.display_name ?? data.user.email,
  };
}
export async function requestPasswordReset(email: string) {
  const sb = getSupabaseBrowser();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/update-password`,
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(newPassword: string) {
  const sb = getSupabaseBrowser();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}