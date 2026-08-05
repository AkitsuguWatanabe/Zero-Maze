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
  scopeLabel: string;
  recentHistory: Array<{
    created_at: string;
    assignee_name: string | null;
    assignee_rank: string | null;
    total_score: number;
    initial_total_score: number;
    passed: boolean;
  }>;
  ownRecentHistory: Array<{
    created_at: string;
    assignee_name: string | null;
    assignee_rank: string | null;
    total_score: number;
    initial_total_score: number;
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
    .select("created_at, assignee_name, assignee_rank, total_score, initial_total_score, scores, status")
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

  // ログイン中の指示者本人が作成した指示のみに絞った履歴（推移グラフの個人分に使用）
  let ownQuery = supabase
    .from("instructions")
    .select("created_at, assignee_name, assignee_rank, total_score, initial_total_score, status")
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
    total_score: number;
    initial_total_score: number | null;
    status: string | null;
  };

  const [{ data, error }, { data: ownData, error: ownError }] = await Promise.all([
    query,
    ctx?.userId ? ownQuery : Promise.resolve({ data: [] as OwnRow[], error: null }),
  ]);
  if (error) throw new Error(error.message);
  if (ownError) throw new Error(ownError.message);

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

  // 20-9: total_score は一覧表示用の最終（GO確定時点の）スコアのまま維持し、
  // initial_total_score を別フィールドとして追加する。推移グラフは
  // initial_total_score を使う（AI修正込みの最新スコアだと、GO確定時にはほぼ
  // 全員が高得点に揃ってしまい、指示者本来の実力の伸びが見えなくなるため）。
  // このカラム追加前の行は initial_total_score が無いので total_score にフォールバック。
  const recentHistory = rows.slice(0, 20).map((r) => ({
    created_at: r.created_at as string,
    assignee_name: r.assignee_name as string | null,
    assignee_rank: r.assignee_rank as string | null,
    total_score: r.total_score as number,
    initial_total_score: (r.initial_total_score ?? r.total_score) as number,
    passed: r.status === "confirmed",
  }));

  const ownRecentHistory = (ownData ?? []).map((r) => ({
    created_at: r.created_at,
    assignee_name: r.assignee_name,
    assignee_rank: r.assignee_rank,
    total_score: r.total_score,
    initial_total_score: r.initial_total_score ?? r.total_score,
    passed: r.status === "confirmed",
  }));

  return { totalCount: rows.length, averages, weakest, scopeLabel, recentHistory, ownRecentHistory };
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

export async function POST() {
  try {
    const stats = await buildStats();

    if (stats.totalCount < 3) {
      return NextResponse.json({
        aiAdvice: "指示履歴が3件以上になると、AIによる個別アドバイスが生成されます。まずはいくつか指示を作成してみてください。",
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const avgSummary = SCORE_KEYS.map(
      (k) => `${SCORE_LABELS[k]}：平均${stats.averages[k]}点`,
    ).join("、");

    const prompt = `あなたは管理職向けのマネジメントコーチです。以下は、ある上司が過去${stats.totalCount}回に渡ってZero-Mazeシステムに入力した業務指示の評価スコアの平均値です。${avgSummary}。最も低い項目：${stats.weakest.map((k) => `${SCORE_LABELS[k]}（${stats.averages[k]}点）`).join("、")}。この結果を踏まえて、この上司が指示の品質を改善するための具体的なアドバイスを300〜400字の日本語で書いてください。弱点の原因を1〜2点指摘し、すぐに実践できる改善行動を2〜3点提示し、励ましの言葉で締めくくってください。箇条書きは使わず、自然な文章で書いてください。`;

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