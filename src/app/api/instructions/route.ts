import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/server-auth";
import type { InstructionDraft, Evaluation, BusinessCategory } from "@/lib/mock-data";

export async function POST(req: NextRequest) {
  let body: {
    draft: InstructionDraft;
    evaluation: Evaluation;
    raw_input: string;
    final_text: string;
    business_category?: BusinessCategory | null;
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
    const [supabase, userId] = await Promise.all([
      Promise.resolve(getSupabaseServer()),
      getCurrentUserId(),
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
      created_by_user_id: userId ?? null,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/instructions]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "保存に失敗しました" },
      { status: 500 },
    );
  }
}
