/**
 * Supabase clients — server (service role) and browser (anon key for auth).
 */
import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

// ─── Server-side client (service role) ────────────────────────────────────
// Use in API route handlers only. Never import in client components.
export function getSupabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  }
  return createClient(url, key);
}

// ─── Browser-side client (cookie-based session via @supabase/ssr) ──────────
// Uses cookie storage so middleware can read the session server-side.
// Safe to use in "use client" components only.
let _browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (_browserClient) return _browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set");
  }
  _browserClient = createBrowserClient(url, key);
  return _browserClient;
}

// ─── Shared types ──────────────────────────────────────────────────────────
export type InstructionRow = {
  id?: string;
  raw_input?: string;
  what: string;
  purpose: string | null;
  completion: string | null;
  deadline: string | null;
  constraints: string | null;
  estimated_hours?: string | null;
  final_text?: string | null;
  scores: Record<string, number>;
  total_score: number;
  initial_scores?: Record<string, number> | null;
  initial_total_score?: number | null;
  business_category?: Record<string, string> | null;
  consistency_error?: string | null;
  over_interference?: boolean;
  urgency?: "high" | "medium" | "low" | null;
  assignee_name?: string | null;
  tone?: string | null;
  assignee_rank?: "A" | "B" | "C" | "D" | null;
  support_mode?: "efficiency" | "coaching" | null;
  milestones?: string[] | null;
  status: "draft" | "evaluated" | "confirmed" | "sent";
  created_by_user_id?: string | null;
  created_at?: string;
};
