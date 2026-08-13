"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import { SiteFooter } from "@/components/SiteHeader";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { PageHeader } from "@/components/PageHeader";
import { RankBadge } from "@/components/RankBadge";
import type { AssigneeRank, FeasibilityVerdict } from "@/lib/mock-data";
import type { StatsPayload } from "@/app/api/advice/route";

// URGENCY_LABELS等、このアプリで既に使われている「良好=緑・要注意=amber・
// 危険=赤」という状態色の慣習に合わせる（新しい配色は導入しない）。
const VERDICT_COLOR: Record<FeasibilityVerdict, string> = {
  ok: "#16a34a",      // green-600
  caution: "#d97706", // amber-600
  risk: "#dc2626",    // red-600
};
const VERDICT_LABEL: Record<FeasibilityVerdict, string> = { ok: "○ 問題なし", caution: "△ 要確認", risk: "× 要対応" };
const VERDICT_TEXT_CLASS: Record<FeasibilityVerdict, string> = {
  ok: "text-green-600",
  caution: "text-amber-600",
  risk: "text-destructive",
};

function VerdictBadge({ verdict }: { verdict: FeasibilityVerdict | null }) {
  if (!verdict) return <span className="text-sm text-muted-foreground">—</span>;
  return <span className={`text-sm font-semibold ${VERDICT_TEXT_CLASS[verdict]}`}>{VERDICT_LABEL[verdict]}</span>;
}

const stripChartConfig = {
  value: { label: "判定" },
} satisfies ChartConfig;

// 数値0-30のトレンド折れ線グラフだった旧ScoreTrendChartの代替。1件の指示に
// 対して質的判定は「○/△/×のどれか1つ」であり分布ではないため、積み上げ棒
// グラフではなく、時系列順に色分けした棒（ステータスストリップ）で表現する。
function VerdictStrip({
  history,
  verdictKey,
  label,
}: {
  history: StatsPayload["recentHistory"];
  verdictKey: "can_execute_verdict" | "can_meet_deadline_verdict";
  label: string;
}) {
  const withVerdict = history.filter((h) => h[verdictKey] !== null);
  if (withVerdict.length === 0) {
    return (
      <div>
        <div className="mb-1.5 text-sm font-medium text-foreground">{label}</div>
        <div className="flex h-12 items-center justify-center text-sm text-muted-foreground">
          判定データがまだありません。
        </div>
      </div>
    );
  }

  const data = withVerdict
    .slice()
    .reverse()
    .map((h) => ({
      date: new Date(h.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }),
      value: 1,
      verdict: h[verdictKey] as FeasibilityVerdict,
    }));
  const counts: Record<FeasibilityVerdict, number> = { ok: 0, caution: 0, risk: 0 };
  for (const d of data) counts[d.verdict]++;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {(["ok", "caution", "risk"] as const).map((v) => (
            <span key={v} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: VERDICT_COLOR[v] }} />
              {VERDICT_LABEL[v]}（{counts[v]}）
            </span>
          ))}
        </div>
      </div>
      <ChartContainer config={stripChartConfig} className="aspect-auto h-16 w-full">
        <BarChart data={data} margin={{ left: 0, right: 12, top: 4, bottom: 0 }} barCategoryGap={2}>
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" />
          <YAxis hide domain={[0, 1]} />
          <Bar dataKey="value" radius={2} maxBarSize={16}>
            {data.map((d, i) => <Cell key={i} fill={VERDICT_COLOR[d.verdict]} />)}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function MissingPerspectiveBar({ label, count, max }: { label: string; count: number; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-accent transition-all" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-mono font-semibold text-foreground">{count}件</span>
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

  const maxMissingCount = stats ? Math.max(1, ...stats.topMissingPerspectives.map((p) => p.count)) : 1;
  const executeCautionRiskPct = stats && stats.canExecuteRates.total > 0
    ? Math.round(((stats.canExecuteRates.caution + stats.canExecuteRates.risk) / stats.canExecuteRates.total) * 100)
    : null;
  const deadlineCautionRiskPct = stats && stats.canMeetDeadlineRates.total > 0
    ? Math.round(((stats.canMeetDeadlineRates.caution + stats.canMeetDeadlineRates.risk) / stats.canMeetDeadlineRates.total) * 100)
    : null;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <PageHeader
          eyebrow="Advice"
          title="マネジメント助言"
          description="過去の指示履歴から、AIによる質的判定（○/△/×）の傾向を分析します。AIアドバイスは必要なときだけ生成できます。"
        />

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
            {/* Left: verdict rates + trend + AI advice */}
            <div className="space-y-6 lg:col-span-2">
              {/* Missing perspectives */}
              <div className="overflow-hidden rounded-sm border border-border bg-card shadow-paper">
                <div className="border-b border-border bg-muted/30 px-6 py-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Missing Perspectives</div>
                  <h2 className="mt-1 font-serif text-lg font-semibold">{stats.scopeLabel}で指摘の多かった観点（直近{stats.totalCount}件）</h2>
                </div>
                <div className="p-6 space-y-4">
                  {stats.topMissingPerspectives.length === 0 ? (
                    <p className="text-sm text-muted-foreground">指摘された観点はまだありません。</p>
                  ) : (
                    stats.topMissingPerspectives.map((p) => (
                      <MissingPerspectiveBar key={p.key} label={p.label} count={p.count} max={maxMissingCount} />
                    ))
                  )}
                </div>
              </div>

              {/* Verdict trend — tenant_adminは全社、team_leader・memberは自チームの範囲 */}
              <div className="overflow-hidden rounded-sm border border-border bg-card shadow-paper">
                <div className="border-b border-border bg-muted/30 px-6 py-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Verdict Trend · {stats.scopeLabel}</div>
                  <h2 className="mt-1 font-serif text-lg font-semibold">{stats.scopeLabel}の判定推移（直近{stats.recentHistory.length}件）</h2>
                  <p className="mt-1 text-sm text-muted-foreground">確認時点でAIが下した質的判定です。緑＝○問題なし、amber＝△要確認、赤＝×要対応。</p>
                </div>
                <div className="space-y-4 p-6">
                  <VerdictStrip history={stats.recentHistory} verdictKey="can_execute_verdict" label="実行可否" />
                  <VerdictStrip history={stats.recentHistory} verdictKey="can_meet_deadline_verdict" label="期限遵守" />
                </div>
              </div>

              {/* Verdict trend — own instructions only */}
              <div className="overflow-hidden rounded-sm border border-border bg-card shadow-paper">
                <div className="border-b border-border bg-muted/30 px-6 py-4">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Verdict Trend · You</div>
                  <h2 className="mt-1 font-serif text-lg font-semibold">あなたの判定推移（直近{stats.ownRecentHistory.length}件）</h2>
                </div>
                <div className="space-y-4 p-6">
                  <VerdictStrip history={stats.ownRecentHistory} verdictKey="can_execute_verdict" label="実行可否" />
                  <VerdictStrip history={stats.ownRecentHistory} verdictKey="can_meet_deadline_verdict" label="期限遵守" />
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
                          : "ボタンを押すとAIが判定の傾向を分析してアドバイスを生成します。"}
                      </p>
                      {adviceError && (
                        <p className="text-sm font-medium text-destructive">{adviceError}</p>
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
                    ["確認件数", `${stats.totalCount} 件`],
                    ["実行可否 △×率", executeCautionRiskPct !== null ? `${executeCautionRiskPct}%（${stats.canExecuteRates.total}件中）` : "データなし"],
                    ["期限遵守 △×率", deadlineCautionRiskPct !== null ? `${deadlineCautionRiskPct}%（${stats.canMeetDeadlineRates.total}件中）` : "データなし"],
                    ["最多指摘観点", stats.topMissingPerspectives[0]?.label ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2 text-sm">
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
                    <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                      履歴がありません。指示を作成してGOボタンを押すと記録されます。
                    </div>
                  ) : (
                    stats.recentHistory.map((h, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{h.assignee_name ?? "—"}</span>
                            {h.assignee_rank && (
                              <span className="shrink-0">
                                <RankBadge rank={h.assignee_rank as AssigneeRank} />
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-sm text-muted-foreground">
                            {new Date(h.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <div className="shrink-0 space-y-0.5 text-right">
                          <VerdictBadge verdict={h.can_execute_verdict} />
                          <VerdictBadge verdict={h.can_meet_deadline_verdict} />
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
