import { NextRequest, NextResponse } from "next/server";
import { APIConnectionTimeoutError } from "openai";
import { judgeFeasibility } from "@/lib/evaluate-core";
import { getTenantModelOverrides } from "@/lib/server-auth";
import type { AssigneeRank, SupportMode } from "@/lib/mock-data";

const VALID_RANKS: AssigneeRank[] = ["A", "B", "C", "D"];

// Same 120s-cutoff 504 issue observed on /api/evaluate — see that file's comment.
export const maxDuration = 45;

type FeasibilityRequestBody = {
  task_content: string;
  background: string;
  deadline: string;
  estimated_hours?: string;
  completion_deliverable?: string;
  constraints?: string;
  assignee_rank?: string;
  support_mode?: string;
  importance?: string;
};

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  let body: FeasibilityRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    task_content, background, deadline, estimated_hours, completion_deliverable, constraints,
    assignee_rank, support_mode, importance,
  } = body ?? {};
  if (!task_content?.trim()) {
    return NextResponse.json({ error: "作業概要（task_content）は必須です" }, { status: 400 });
  }
  if (!background?.trim()) {
    return NextResponse.json({ error: "背景（background）は必須です" }, { status: 400 });
  }

  const rank: AssigneeRank = VALID_RANKS.includes(assignee_rank as AssigneeRank)
    ? (assignee_rank as AssigneeRank)
    : "B";
  const mode: SupportMode = support_mode === "coaching" ? "coaching" : "efficiency";

  try {
    // judgeFeasibility plays the same "frequent, always-on" role that
    // scoreInstruction's standard-importance path used to play, so it
    // follows the same tenant-override lookup (see /api/evaluate) rather
    // than always using the global default model.
    const overrides = await getTenantModelOverrides();
    const modelOverride = (importance === "high" ? overrides.high : overrides.standard) ?? undefined;

    const judgment = await judgeFeasibility(
      { task_content, background, deadline, estimated_hours, completion_deliverable, constraints },
      rank,
      mode,
      modelOverride,
    );

    return NextResponse.json(judgment);
  } catch (err) {
    console.error("[/api/feasibility]", err);
    if (err instanceof APIConnectionTimeoutError) {
      return NextResponse.json(
        {
          error:
            "AIが混み合っているようです🙏 少し時間をおいてから、もう一度お試しください。",
        },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: "確認中にエラーが発生しました。お手数ですが、もう一度お試しください。" },
      { status: 500 },
    );
  }
}
