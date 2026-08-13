import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import { PERSPECTIVES, type FeasibilityVerdict, type ScoreKey } from "@/lib/mock-data";
import OpenAI from "openai";

const PERSPECTIVE_LABELS: Record<ScoreKey, string> = Object.fromEntries(
  PERSPECTIVES.map((p) => [p.key, p.label]),
) as Record<ScoreKey, string>;

export type VerdictRates = {
  ok: number;
  caution: number;
  risk: number;
  total: number; // 判定が記録されている件数（旧数値評価時代の行はnullなので除外）
};

export type StatsPayload = {
  totalCount: number;
  canExecuteRates: VerdictRates;
  canMeetDeadlineRates: VerdictRates;
  topMissingPerspectives: Array<{ key: string; label: string; count: number }>;
  scopeLabel: string;
  recentHistory: Array<{
    created_at: string;
    assignee_name: string | null;
    assignee_rank: string | null;
    can_execute_verdict: FeasibilityVerdict | null;
    can_meet_deadline_verdict: FeasibilityVerdict | null;
  }>;
  ownRecentHistory: Array<{
    created_at: string;
    assignee_name: string | null;
    assignee_rank: string | null;
    can_execute_verdict: FeasibilityVerdict | null;
    can_meet_deadline_verdict: FeasibilityVerdict | null;
  }>;
};

function computeVerdictRates(verdicts: Array<FeasibilityVerdict | null>): VerdictRates {
  let ok = 0, caution = 0, risk = 0, total = 0;
  for (const v of verdicts) {
    if (v === "ok") { ok++; total++; }
    else if (v === "caution") { caution++; total++; }
    else if (v === "risk") { risk++; total++; }
  }
  return { ok, caution, risk, total };
}

async function buildStats(): Promise<StatsPayload> {
  const [supabase, ctx] = await Promise.all([
    Promise.resolve(getSupabaseServer()),
    getCurrentUserContext(),
  ]);

  let query = supabase
    .from("instructions")
    .select("created_at, assignee_name, assignee_rank, can_execute_verdict, can_meet_deadline_verdict, missing_perspective_keys, status")
    .order("created_at", { ascending: false })
    .limit(50);

  // team_leader・memberは自チームの範囲に限定する（tenant_adminのみテナント全体を閲覧可能）。
  // 20-11: 従来は全ロールでテナント全体を対象としており、他チームの指示内容・担当者名が
  // 見えてしまっていたための修正。team_id未所属（teamId無し）の場合は対象0件とする。
  const scopeToTeam = (ctx?.role === "team_leader" || ctx?.role === "member") && !!ctx?.teamId;

  let scopeLabel = "全社";
  if (ctx?.tenantId) {
    query = query.eq("tenant_id", ctx.tenantId);
    if (scopeToTeam) {
      query = query.eq("team_id", ctx.teamId as string);
      const { data: teamRow } = await supabase
        .from("teams")
        .select("name")
        .eq("id", ctx.teamId as string)
        .maybeSingle();
      scopeLabel = teamRow?.name ?? "自チーム";
    } else if ((ctx?.role === "team_leader" || ctx?.role === "member") && !ctx?.teamId) {
      // チーム未所属：対象0件（安全側のデフォルト）
      query = query.eq("team_id", "00000000-0000-0000-0000-000000000000");
      scopeLabel = "自チーム";
    }
  } else if (ctx?.userId) {
    query = query.eq("created_by_user_id", ctx.userId);
  }

  // ログイン中の指示者本人が作成した指示のみに絞った履歴（推移表示の個人分に使用）
  let ownQuery = supabase
    .from("instructions")
    .select("created_at, assignee_name, assignee_rank, can_execute_verdict, can_meet_deadline_verdict, status")
    .order("created_at", { ascending: false })
    .limit(20);

  if (ctx?.userId) {
    ownQuery = ownQuery.eq("created_by_user_id", ctx.userId);
  }
  if (ctx?.tenantId) {
    ownQuery = ownQuery.eq("tenant_id", ctx.tenantId);
  }

  type OwnRow = {
    created_at: string;
    assignee_name: string | null;
    assignee_rank: string | null;
    can_execute_verdict: FeasibilityVerdict | null;
    can_meet_deadline_verdict: FeasibilityVerdict | null;
    status: string | null;
  };

  const [{ data, error }, { data: ownData, error: ownError }] = await Promise.all([
    query,
    ctx?.userId ? ownQuery : Promise.resolve({ data: [] as OwnRow[], error: null }),
  ]);
  if (error) throw new Error(error.message);
  if (ownError) throw new Error(ownError.message);

  const rows = data ?? [];

  const canExecuteRates = computeVerdictRates(rows.map((r) => r.can_execute_verdict as FeasibilityVerdict | null));
  const canMeetDeadlineRates = computeVerdictRates(rows.map((r) => r.can_meet_deadline_verdict as FeasibilityVerdict | null));

  // 21-2: 数値6軸の平均点による「最弱項目」の質的な代替。missing_perspective_keys
  // （確認のたびにAIが指摘した観点）の頻度を集計し、上位を表示する。
  const missingCounts: Partial<Record<ScoreKey, number>> = {};
  for (const row of rows) {
    const keys = (row.missing_perspective_keys ?? []) as ScoreKey[];
    for (const k of keys) missingCounts[k] = (missingCounts[k] ?? 0) + 1;
  }
  const topMissingPerspectives = (Object.entries(missingCounts) as Array<[ScoreKey, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => ({ key, label: PERSPECTIVE_LABELS[key] ?? key, count }));

  const recentHistory = rows.slice(0, 20).map((r) => ({
    created_at: r.created_at as string,
    assignee_name: r.assignee_name as string | null,
    assignee_rank: r.assignee_rank as string | null,
    can_execute_verdict: r.can_execute_verdict as FeasibilityVerdict | null,
    can_meet_deadline_verdict: r.can_meet_deadline_verdict as FeasibilityVerdict | null,
  }));

  const ownRecentHistory = (ownData ?? []).map((r) => ({
    created_at: r.created_at,
    assignee_name: r.assignee_name,
    assignee_rank: r.assignee_rank,
    can_execute_verdict: r.can_execute_verdict,
    can_meet_deadline_verdict: r.can_meet_deadline_verdict,
  }));

  return {
    totalCount: rows.length,
    canExecuteRates,
    canMeetDeadlineRates,
    topMissingPerspectives,
    scopeLabel,
    recentHistory,
    ownRecentHistory,
  };
}

export async function GET() {
  try {
    const stats = await buildStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[GET /api/advice]", err);
    // 内部例外の生メッセージをそのままユーザーに見せない。詳細は上の
    // console.errorでログに残し、画面には分かりやすい文言だけ返す。
    return NextResponse.json(
      { error: "統計の取得でエラーが発生しました。お手数ですが、もう一度お試しください。" },
      { status: 500 },
    );
  }
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

export async function POST() {
  try {
    const stats = await buildStats();

    if (stats.totalCount < 3) {
      return NextResponse.json({
        aiAdvice: "指示履歴が3件以上になると、AIによる個別アドバイスが生成されます。まずはいくつか指示を作成してみてください。",
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 21-2: 数値スコアの平均点羅列（avgSummary）を、質的な要約文に差し替え。
    // can_execute_verdict/can_meet_deadline_verdictがnullの行（旧数値評価
    // 時代に作成された行）は分母から除外しているため、totalが0の場合は
    // その旨を明示する。
    const executeSummary = stats.canExecuteRates.total > 0
      ? `「正しく実行できるか」の観点でcaution/riskの指摘があったのは${pct(stats.canExecuteRates.caution + stats.canExecuteRates.risk, stats.canExecuteRates.total)}%（${stats.canExecuteRates.total}件中）`
      : "「正しく実行できるか」の質的判定データはまだありません";
    const deadlineSummary = stats.canMeetDeadlineRates.total > 0
      ? `「期限に間に合うか」の観点でcaution/riskの指摘があったのは${pct(stats.canMeetDeadlineRates.caution + stats.canMeetDeadlineRates.risk, stats.canMeetDeadlineRates.total)}%（${stats.canMeetDeadlineRates.total}件中）`
      : "「期限に間に合うか」の質的判定データはまだありません";
    const missingSummary = stats.topMissingPerspectives.length > 0
      ? `最も頻繁に指摘された観点は、${stats.topMissingPerspectives.map((p) => `${p.label}（${p.count}件）`).join("、")}。`
      : "";

    const prompt = `あなたは管理職向けのマネジメントコーチです。以下は、ある上司が過去${stats.totalCount}回に渡ってZero-Mazeシステムに入力した業務指示について、AIが確認した質的な傾向です。${executeSummary}。${deadlineSummary}。${missingSummary}この結果を踏まえて、この上司が指示の品質を改善するための具体的なアドバイスを300〜400字の日本語で書いてください。傾向の背景にありそうな原因を1〜2点指摘し、すぐに実践できる改善行動を2〜3点提示し、励ましの言葉で締めくくってください。箇条書きは使わず、自然な文章で書いてください。`;

    const response = await client.responses.create({
      model: "gpt-5.5",
      reasoning: { effort: "low" },
      input: [{ role: "user", content: prompt }],
    });

    return NextResponse.json({ aiAdvice: response.output_text.trim() });
  } catch (err) {
    console.error("[POST /api/advice]", err);
    // 内部例外の生メッセージをそのままユーザーに見せない。詳細は上の
    // console.errorでログに残し、画面には分かりやすい文言だけ返す。
    return NextResponse.json(
      { error: "アドバイスの生成でエラーが発生しました。お手数ですが、もう一度お試しください。" },
      { status: 500 },
    );
  }
}
