"use client";

import { useEffect, useState } from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { SiteFooter } from "@/components/SiteHeader";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { RANK_COLORS } from "@/components/RankBadge";
import type { StatsPayload } from "@/app/api/advice/route";

const SCORE_LABELS: Record<string, string> = {
  purpose_background:     "目的・背景",
  task_content:           "依頼内容",
  completion_deliverable: "完了条件",
  deadline_clarity:       "期限",
  workload_estimate:      "見込み工数",
  constraints_notes:      "制約",
};

const SCORE_KEYS = [
  "purpose_background", "task_content", "completion_deliverable",
  "deadline_clarity", "workload_estimate", "constraints_notes",
];

const trendChartConfig = {
  score: { label: "合計スコア", color: "var(--chart-1)" },
} satisfies ChartConfig;

function ScoreTrendChart({ history }: { history: StatsPayload["recentHistory"] }) {
  if (history.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
        履歴が2件以上になるとグラフが表示されます。
      </div>
    );
  }

  const data = history
    .slice()
    .reverse()
    .map((h) => ({
      date: new Date(h.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }),
      score: h.total_score,
    }));

  return (
    <ChartContainer config={trendChartConfig} className="aspect-auto h-48 w-full">
      <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis domain={[0, 30]} tickLine={false} axisLine={false} tickMargin={8} width={28} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Line
          type="monotone"
          dataKey="score"
          stroke="var(--color-score)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-score)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}

function ScoreBar({ value, isWeak }: { value: number; isWeak: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${isWeak ? "bg-destructive/70" : "bg-gradient-accent"}`}
          style={{ width: `${(value / 5) * 100}%` }}
        />
      </div>
      <span className={`w-10 text-right text-xs font-mono font-semibold ${isWeak ? "text-destructive" : "text-foreground"}`}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export default function AdvicePage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [generatingAdvice, setGeneratingAdvice] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  // Load stats + history on mount — no AI call.
  useEffect(() => {
    fetch("/api/advice")
      .then((r) => r.json())
      .then((d: StatsPayload | { error: string }) => {
        if ("error" in d) throw new Error(d.error);
        setStats(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "取得に失敗しました"))
      .finally(() => setLoadingStats(false));
  }, []);

  async function generateAdvice() {
    setGeneratingAdvice(true);
    setAdviceError(null);
    try {
      const res = await fetch("/api/advice", { method: "POST" });
      const d = await res.json() as { aiAdvice?: string; error?: string };
      if (!res.ok || !d.aiAdvice) throw new Error(d.error ?? "生成に失敗しました");
      setAiAdvice(d.aiAdvice);
    } catch (e) {
      setAdviceError(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setGeneratingAdvice(false);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="text-xs uppercase tracking-widest text-accent">Advice</div>
        <h1 className="mt-2 font-serif text-3xl font-semibold">マネジメント助言</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          過去の指示履歴からスコアの傾向を分析します。AIアドバイスは必要なときだけ生成できます。
        </p>

        {loadingStats && (
          <div className="mt-16 flex flex-col items-center gap-4 text-muted-foreground">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            <span className="text-sm">読み込み中…</span>
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-sm border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {stats && !loadingStats && (
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {/* Left: scores + AI advice */}
            <div className="space-y-6 lg:col-span-2">
              {/* Score averages */}
              <div className="overflow-hidden rounded-sm border border-border bg-card shadow-paper">
                <div className="border-b border-border bg-muted/30 px-6 py-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Score Averages</div>
                  <h2 className="mt-1 font-serif text-lg font-semibold">6観点スコアの平均（直近{stats.totalCount}件）</h2>
                </div>
                <div className="p-6 space-y-4">
                  {SCORE_KEYS.map((k) => (
                    <div key={k}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className={`text-xs font-medium ${stats.weakest.includes(k) ? "text-destructive" : "text-foreground"}`}>
                          {SCORE_LABELS[k]}
                          {stats.weakest.includes(k) && (
                            <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">要改善</span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">/ 5.0</span>
                      </div>
                      <ScoreBar value={stats.averages[k] ?? 0} isWeak={stats.weakest.includes(k)} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Score trend — company-wide */}
              <div className="overflow-hidden rounded-sm border border-border bg-card shadow-paper">
                <div className="border-b border-border bg-muted/30 px-6 py-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Score Trend · Company</div>
                  <h2 className="mt-1 font-serif text-lg font-semibold">全社の合計スコア推移（直近{stats.recentHistory.length}件）</h2>
                </div>
                <div className="p-6">
                  <ScoreTrendChart history={stats.recentHistory} />
                </div>
              </div>

              {/* Score trend — own instructions only */}
              <div className="overflow-hidden rounded-sm border border-border bg-card shadow-paper">
                <div className="border-b border-border bg-muted/30 px-6 py-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Score Trend · You</div>
                  <h2 className="mt-1 font-serif text-lg font-semibold">あなたの合計スコア推移（直近{stats.ownRecentHistory.length}件）</h2>
                </div>
                <div className="p-6">
                  <ScoreTrendChart history={stats.ownRecentHistory} />
                </div>
              </div>

              {/* AI advice — lazy */}
              <div className="overflow-hidden rounded-sm border border-border bg-card shadow-paper">
                <div className="border-b border-border bg-muted/30 px-6 py-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">AI Advice</div>
                  <h2 className="mt-1 font-serif text-lg font-semibold">AIからのアドバイス</h2>
                </div>
                <div className="p-6">
                  {aiAdvice ? (
                    <>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiAdvice}</p>
                      <button
                        onClick={generateAdvice}
                        disabled={generatingAdvice}
                        className="mt-4 text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-40"
                      >
                        再生成する
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-start gap-4">
                      <p className="text-sm text-muted-foreground">
                        {stats.totalCount < 3
                          ? `現在${stats.totalCount}件の履歴があります。3件以上になるとAIアドバイスを生成できます。`
                          : "ボタンを押すとAIがスコアの傾向を分析してアドバイスを生成します。"}
                      </p>
                      {adviceError && (
                        <p className="text-xs text-destructive">{adviceError}</p>
                      )}
                      <button
                        onClick={generateAdvice}
                        disabled={generatingAdvice || stats.totalCount < 3}
                        className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
                      >
                        {generatingAdvice ? (
                          <>
                            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                            生成中…
                          </>
                        ) : "AIアドバイスを生成する"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: stats + history */}
            <div className="space-y-4">
              <div className="overflow-hidden rounded-sm border border-border bg-card shadow-paper">
                <div className="border-b border-border bg-muted/30 px-5 py-3">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Summary</div>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    ["総指示件数", `${stats.totalCount} 件`],
                    ["平均合計スコア", `${Object.values(stats.averages).reduce((a, b) => a + b, 0).toFixed(1)} / 30`],
                    ["最弱項目", stats.weakest.map((k) => SCORE_LABELS[k]).join("、")],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-muted-foreground shrink-0">{k}</span>
                      <span className="font-medium text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-sm border border-border bg-card shadow-paper">
                <div className="border-b border-border bg-muted/30 px-5 py-3">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Recent History</div>
                  <div className="mt-1 text-sm font-medium">直近の指示履歴</div>
                </div>
                <div className="divide-y divide-border">
                  {stats.recentHistory.length === 0 ? (
                    <div className="px-5 py-8 text-center text-xs text-muted-foreground">
                      履歴がありません。指示を作成してGOボタンを押すと記録されます。
                    </div>
                  ) : (
                    stats.recentHistory.map((h, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-medium">{h.assignee_name ?? "—"}</span>
                            {h.assignee_rank && (
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-mono font-bold ${RANK_COLORS[h.assignee_rank] ?? ""}`}>
                                {h.assignee_rank}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {new Date(h.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-mono font-semibold">{h.total_score}/30</div>
                          <div className={`text-xs ${h.passed ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                            {h.passed ? "GO済" : "未確定"}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
