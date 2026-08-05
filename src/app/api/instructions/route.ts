import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import type { InstructionDraft, Evaluation, BusinessCategory } from "@/lib/mock-data";

export async function POST(req: NextRequest) {
  let body: {
    draft: InstructionDraft;
    evaluation: Evaluation;
    initialEvaluation?: Evaluation | null;
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

  const { draft, evaluation, initialEvaluation, raw_input, final_text } = body ?? {};
  if (!draft?.overview || !evaluation?.scores) {
    return NextResponse.json({ error: "指示概要と評価結果は必須です" }, { status: 400 });
  }

  try {
    const [supabase, ctx] = await Promise.all([
      Promise.resolve(getSupabaseServer()),
      getCurrentUserContext(),
    ]);

    const ext = evaluation.structured_extraction;
    const { data: inserted, error } = await supabase.from("instructions").insert({
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
      // 20-9: 再評価前の最初の評価（無ければ最新と同値）。マネジメント助言の
      // スコア推移グラフはこちらを使い、AI修正込みでない指示者本来の実力を追う。
      initial_scores:      (initialEvaluation ?? evaluation).scores,
      initial_total_score: (initialEvaluation ?? evaluation).total,
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
    }).select("id, feedback_token").single();
    if (error) throw new Error(error.message);

    // 21-1: 担当者への通知メールはここでは自動送信しない。GO確定と担当者への
    // 送信は別の操作であるべき（指示者が内容を確認したうえで、明示的に
    // 「担当者に送る」を押して送る）という設計のため、feedback_tokenだけを
    // クライアントへ返し、実際の送信は/api/send-emailに委ねる。
    return NextResponse.json({ success: true, feedback_token: inserted?.feedback_token ?? null });
  } catch (err) {
    console.error("[/api/instructions]", err);
    return NextResponse.json(
      { error: "保存に失敗しました" },
      { status: 500 },
    );
  }
}