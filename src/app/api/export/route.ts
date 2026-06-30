import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";

export async function GET() {
  try {
    const [supabase, ctx] = await Promise.all([
      Promise.resolve(getSupabaseServer()),
      getCurrentUserContext(),
    ]);

    let query = supabase
      .from("instructions")
      .select("created_at, assignee_name, assignee_rank, support_mode, business_category, total_score, raw_input, final_text, scores, consistency_error, status")
      .order("created_at", { ascending: false });

    if (ctx?.tenantId) {
      query = query.eq("tenant_id", ctx.tenantId);
    } else if (ctx?.userId) {
      query = query.eq("created_by_user_id", ctx.userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const SCORE_KEYS = ["purpose_background", "task_content", "completion_deliverable", "deadline_clarity", "workload_estimate", "constraints_notes"];
    const SCORE_LABELS = ["目的・背景", "依頼内容", "完了条件", "期限", "工数", "制約"];

    const headers = [
      "作成日時", "担当者名", "ランク", "支援モード", "業務分類", "合計スコア",
      ...SCORE_LABELS,
      "整合性エラー", "ステータス", "元の指示概要", "最終指示文",
    ];

    function csvCell(v: unknown, stripNewlines = false): string {
      let s = v == null ? "" : String(v);
      if (stripNewlines) s = s.replace(/\r?\n/g, " ").trim();
      return `"${s.replace(/"/g, '""')}"`;
    }

    const lines = [
      headers.map((h) => csvCell(h)).join(","),
      ...rows.map((r) => {
        const scores = (r.scores ?? {}) as Record<string, number>;
        const cat = r.business_category as { sub_label?: string } | null;
        return [
          csvCell(r.created_at ? new Date(r.created_at as
