import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/server-auth";

// Returns all saved instructions as a UTF-8 CSV (BOM-prefixed for Excel compatibility).
export async function GET() {
  try {
    const [supabase, userId] = await Promise.all([
      Promise.resolve(getSupabaseServer()),
      getCurrentUserId(),
    ]);

    let query = supabase
      .from("instructions")
      .select("created_at, assignee_name, assignee_rank, support_mode, business_category, total_score, raw_input, final_text, scores, consistency_error, status")
      .order("created_at", { ascending: false });

    if (userId) query = query.eq("created_by_user_id", userId);

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

    // Wrap a value in quotes, escaping internal quotes.
    // newlines are replaced with a space so each record stays on one Excel row.
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
          csvCell(r.created_at ? new Date(r.created_at as string).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : ""),
          csvCell(r.assignee_name),
          csvCell(r.assignee_rank),
          csvCell(r.support_mode === "efficiency" ? "効率重視" : r.support_mode === "coaching" ? "育成重視" : r.support_mode),
          csvCell(cat?.sub_label ?? ""),
          csvCell(r.total_score),
          ...SCORE_KEYS.map((k) => csvCell(scores[k] ?? "")),
          csvCell(r.consistency_error),
          csvCell(r.status),
          csvCell(r.raw_input, true),   // strip newlines — keeps row on one line
          csvCell(r.final_text, true),  // strip newlines — keeps row on one line
        ].join(",");
      }),
    ];

    // Prefix with UTF-8 BOM so Excel opens the file with correct encoding.
    const BOM = "﻿";
    const csv = BOM + lines.join("\r\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="zero-maze-instructions-${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" })}.csv"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/export]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "エクスポートに失敗しました" },
      { status: 500 },
    );
  }
}
