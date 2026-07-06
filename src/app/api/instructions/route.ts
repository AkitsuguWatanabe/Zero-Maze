import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import type { InstructionDraft, Evaluation, BusinessCategory } from "@/lib/mock-data";

export async function POST(req: NextRequest) {
  let body: {
    draft: InstructionDraft;
    evaluation: Evaluation;
    raw_input: string;
    team_id?: string | null;
    final_text: string;
    business_category?: BusinessCategory | null;
    assignee_id?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { draft, evaluation, raw_input, final_text } = body ?? {};
  if (!draft?.overview || !evaluation?.scores) {
    return NextResponse.json({ error: "指示概要と評価結果は必須です" }, { status: 400 });
  }

  try {
    const [supabase, ctx] = await Promise.all([
      Promise.resolve(getSupabaseServer()),
      getCurrentUserContext(),
    ]);

    const ext = evaluation.structured_extraction;
    const { error } = await supabase.from("instructions").insert({
      raw_input:          raw_input || draft.overview,
      what:               ext?.task_content || draft.overview,
      purpose:            ext?.purpose_background || null,
      completion:         ext?.completion_deliverable || null,
      deadline:           ext?.deadline_extracted || draft.deadline || null,
      constraints:        ext?.constraints_extracted || draft.constraints || null,
      estimated_hours:    ext?.workload_extracted || draft.estimated_hours || null,
      final_text:         final_text || null,
      scores:             evaluation.scores,
      total_score:        evaluation.total,
      business_category:  evaluation.business_category ?? null,
      consistency_error:  evaluation.consistency_error ?? null,
      over_interference:  evaluation.over_interference,
      urgency:            draft.urgency || null,
      assignee_name:      draft.assignee_name || null,
      tone:               draft.tone || null,
      assignee_rank:      draft.assignee_rank || null,
      support_mode:       draft.support_mode,
      milestones:         evaluation.milestones ?? null,
      status:             "confirmed",
      created_by_user_id: ctx?.userId ?? null,
      tenant_id:          ctx?.tenantId ?? null,
      team_id:            body.team_id || null,
      assignee_id:        body.assignee_id || null,
    });
    if (error) throw new Error(error.message);

    // Notify the assignee by email (16-1②). Awaited (not fire-and-forget) —
    // Vercel's serverless runtime can cut off unawaited work after the
    // response is sent, so a detached promise here would not reliably run.
    // Wrapped in try/catch so a mail failure never fails the GO confirmation,
    // which is already saved above.
    if (body.assignee_id) {
      try {
        await sendInstructionEmail(supabase, body.assignee_id, draft, final_text);
      } catch (e) {
        console.error("[sendInstructionEmail]", e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/instructions]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "保存に失敗しました" },
      { status: 500 },
    );
  }
}
/**
 * GO確定時、担当者へ確定した指示の全文をメールで送る（16-1②）。
 * Resend APIを直接呼ぶ方式は request-login-id と同じ実装パターンを踏襲。
 */
async function sendInstructionEmail(
  supabase: ReturnType<typeof getSupabaseServer>,
  assigneeId: string,
  draft: InstructionDraft,
  finalText: string,
) {
  const { data: member } = await supabase
    .from("members")
    .select("name, email")
    .eq("id", assigneeId)
    .maybeSingle();

  if (!member?.email) return; // メール未登録の担当者には送らない

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Zero-Maze <noreply@zero-maze.com>",
      to: member.email,
      subject: `【指示確定】${draft.overview.replace(/\s+/g, " ").trim().slice(0, 30)}${draft.overview.length > 30 ? "…" : ""}`,
      html: `
        <p>${member.name} 様</p>
        <p>以下の指示が確定しました。</p>
        <pre style="white-space: pre-wrap; font-family: inherit; background: #f5f5f5; padding: 16px; border-radius: 4px;">${escapeHtml(finalText)}</pre>
        <p>期限：${escapeHtml(draft.deadline || "未設定")}／見込み工数：${escapeHtml(draft.estimated_hours || "未設定")}</p>
      `,
    }),
  });

  if (!resendRes.ok) {
    console.error("[sendInstructionEmail] Resend error:", await resendRes.text());
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}