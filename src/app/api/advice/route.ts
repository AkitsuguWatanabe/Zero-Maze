import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import OpenAI from "openai";

const SCORE_KEYS = [
  "purpose_background",
  "task_content",
  "completion_deliverable",
  "deadline_clarity",
  "workload_estimate",
  "constraints_notes",
] as const;

const SCORE_LABELS: Record<string, string> = {
  purpose_background:     "目的・背景",
  task_content:           "依頼内容・作業内容",
  completion_deliverable: "完了条件・成果物",
  deadline_clarity:       "期限",
  workload_estimate:      "見込み工数",
  constraints_notes:      "注意点・制約",
};

export type StatsPayload = {
  totalCount: number;
  averages: Record<string, number>;
  weakest: string[];
  recentHistory: Array<{
    created_at: string;
    assignee_name: string | null;
    assignee_rank: string | null;
    total_score: number;
    passed: boolean;
  }>;
};

async function buildStats(): Promise<StatsPayload> {
  const [supabase, ctx] = await Promise.all([
    Promise.resolve(getSupabaseServer()),
    getCurrentUserContext(),
  ]);

  let query = supabase
    .from("instructions")
    .select("created_at, assignee_name, assignee_rank, total_score, scores, status")
    .order("created_at", { ascending: false })
    .limit(50);

  if (ctx?.tenantId) {
    query = query.eq("tenant_id", ctx.tenantId);
  } else if (ctx?.userId) {
    query = query.eq("created_by_user_id", ctx.userId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  for (const key of SCORE_KEYS) { sums[key] = 0; counts[key] = 0; }

  for (const row of rows) {
    const s = (row.scores ?? {}) as Record<string, number>;
    for (const key of SCORE_KEYS) {
      if (typeof s[key] === "number") { sums[key] += s[key]; counts[key]++; }
    }
  }

  const averages: Record<string, number> = {};
  for (const key of SCORE_KEYS) {
    averages[key] = counts[key] > 0 ? Math.round((sums[key] / counts[key]) * 10) / 10 : 0;
  }

  const sorted = SCORE_KEYS.slice().sort((a, b) => averages[a] - averages[b]);
  const weakest = sorted.slice(0, 2);

  const recentHistory = rows.slice(0, 20).map((r) => ({
    created_at: r.created_at as string,
    assignee_name: r.assignee_name as string | null,
    assignee_rank: r.assignee_rank as string | null,
    total_score: r.total_score as number,
    passed: r.status === "confirmed",
  }));

  return { totalCount: rows.length, averages, weakest, recentHistory };
}

export async function GET() {
  try {
    const
