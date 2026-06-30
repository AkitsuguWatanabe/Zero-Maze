import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";

function csvCell(v: unknown, stripNewlines = false): string {
  let s = v == null ? "" : String(v);
  if (stripNewlines) s = s.replace(/\r?\n/g, " ").trim();
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const ctx = await getCurrentUserContext();

    let query = supabase
      .from("instructions")
      .select("created_at,assignee_name,assignee_rank,support_mode,business_category,total_score,raw_input,final_text,scores,consistency_error,status")
      .order("created_at", { ascending: false });

    if (ctx?.tenantId) query = query.eq("tenant_id", ctx.tenantId);
    else if (ctx?.userId) query = query.eq("created_by_user_id", ctx.userId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const KEYS = ["purpose_background","task_content","completion_deliverable","deadline_clarity","workload_estimate","constraints_notes"];
    const LABELS = ["目的・背景","依頼内容","完了条件","期限","工数","制約"];
    const headers = ["作成日時","担当者名","ランク","支援モード","業務分類","合計スコア",...LABELS,"整合性エラー","ステータス","元の指示概要","最終指示文"];

    const lines = [headers.map((h) => csvCell(h)).join(",")];

    for (const r of data ?? []) {
      const scores = (r.scores ?? {}) as Record<string, number>;
      const cat = r.business_category as { sub_label?: string } | null;
      const dt = r.created_at ? new Date(r.created_at as string).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "";
      const mode = r.support_mode === "efficiency" ? "効率重視" : r.support_mode === "coaching" ? "育成重視" : r.support_mode;
      lines.push([
        csvCell(dt), csvCell(r.assignee_name), csvCell(r.assignee_rank),
        csvCell(mode), csvCell(cat?.sub_label ?? ""), csvCell(r.total_score),
        ...KEYS.map((k) => csvCell(scores[k] ?? "")),
        csvCell(r.consistency_error), csvCell(r.status),
        csvCell(r.raw_input, true), csvCell(r.final_text, true),
      ].join(","));
    }

    const csv = "\uFEFF" + lines.join("\r\n");
    const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="zero-maze-${date}.csv"`,
      },
    });
  } catch (err) {
    console.error("[GET /api/export]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "エクスポートに失敗しました" }, { status: 500 });
  }
}
