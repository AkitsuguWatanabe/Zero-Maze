import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import { PERSPECTIVES, type FeasibilityVerdict, type ScoreKey } from "@/lib/mock-data";

function csvCell(v: unknown, stripNewlines = false): string {
  let s = v == null ? "" : String(v);
  if (stripNewlines) s = s.replace(/\r?\n/g, " ").trim();
  return `"${s.replace(/"/g, '""')}"`;
}

const VERDICT_LABELS: Record<FeasibilityVerdict, string> = { ok: "○", caution: "△", risk: "×" };
const PERSPECTIVE_LABELS: Record<ScoreKey, string> = Object.fromEntries(
  PERSPECTIVES.map((p) => [p.key, p.label]),
) as Record<ScoreKey, string>;

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const ctx = await getCurrentUserContext();

    let query = supabase
      .from("instructions")
      .select("created_at,assignee_name,assignee_rank,support_mode,business_category,can_execute_verdict,can_execute_reason,can_meet_deadline_verdict,can_meet_deadline_reason,missing_perspective_keys,raw_input,final_text,consistency_error,status")
      .order("created_at", { ascending: false });

    // team_leader・memberは自チームの範囲に限定する（tenant_adminのみテナント全体を出力可能）。
    // 20-11: 従来は全ロールでテナント全体の指示内容（元の指示概要・最終指示文を含む）を
    // 出力できてしまっていたための修正。
    if (ctx?.tenantId) {
      query = query.eq("tenant_id", ctx.tenantId);
      if ((ctx.role === "team_leader" || ctx.role === "member")) {
        query = query.eq("team_id", ctx.teamId ?? "00000000-0000-0000-0000-000000000000");
      }
    } else if (ctx?.userId) {
      query = query.eq("created_by_user_id", ctx.userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const headers = [
      "作成日時", "担当者名", "指示レベル", "支援モード", "業務分類",
      "実行可否", "実行可否_理由", "期限遵守", "期限遵守_理由", "指摘観点",
      "整合性エラー", "ステータス", "元の指示概要", "最終指示文",
    ];

    const lines = [headers.map((h) => csvCell(h)).join(",")];

    for (const r of data ?? []) {
      const cat = r.business_category as { sub_label?: string } | null;
      const dt = r.created_at ? new Date(r.created_at as string).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "";
      const mode = r.support_mode === "efficiency" ? "効率重視" : r.support_mode === "coaching" ? "育成重視" : r.support_mode;
      const canExecute = r.can_execute_verdict as FeasibilityVerdict | null;
      const canMeetDeadline = r.can_meet_deadline_verdict as FeasibilityVerdict | null;
      const missingKeys = (r.missing_perspective_keys ?? []) as ScoreKey[];
      lines.push([
        csvCell(dt), csvCell(r.assignee_name), csvCell(r.assignee_rank),
        csvCell(mode), csvCell(cat?.sub_label ?? ""),
        csvCell(canExecute ? VERDICT_LABELS[canExecute] : ""), csvCell(r.can_execute_reason, true),
        csvCell(canMeetDeadline ? VERDICT_LABELS[canMeetDeadline] : ""), csvCell(r.can_meet_deadline_reason, true),
        csvCell(missingKeys.map((k) => PERSPECTIVE_LABELS[k] ?? k).join("、")),
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
    return NextResponse.json({ error: "エクスポートに失敗しました" }, { status: 500 });
  }
}
