import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteHeader";
import { PERSPECTIVES, SCORE_LABELS } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "6観点評価 — 指示の品質スコアリング基準",
  description:
    "6項目×5段階（30点満点）で、指示の迷いにくさを評価します。構造化項目と評価項目を完全に一致させた設計です。",
  openGraph: {
    title: "6観点評価方式",
    description: "正しさではなく『迷いにくさ』を測る評価基準。",
  },
};

const goodNg: Record<string, { good: string[]; ng: string[] }> = {
  purpose_background: {
    good: ["ビジネス上の成果が1文で書かれている", "誰のためか・誰が使うか分かる", "なぜ今やるか理由がある"],
    ng: ["「やっておいて」だけ", "背景が不明", "なぜ必要か分からない"],
  },
  task_content: {
    good: ["対象物が具体的（「A社向け提案資料」）", "形式・分量・構成が示されている", "動詞が具体的（「作成する」「集計する」）"],
    ng: ["「まとめる」「整理する」など曖昧な動詞", "範囲が示されない", "何を・どこまでか分からない"],
  },
  completion_deliverable: {
    good: ["成果物の形式が明確", "提出先・提出方法が明記", "誰のレビューで完了か分かる"],
    ng: ["「終わったら教えて」だけ", "完了の定義がない", "成果物が不明確"],
  },
  deadline_clarity: {
    good: ["日付と時刻が両方明記されている", "曜日も記載されている", "絶対日付で書かれている"],
    ng: ["「なるべく早く」など曖昧", "「来週中」など範囲のみ", "期限が書かれていない"],
  },
  workload_estimate: {
    good: ["具体的な時間数が書かれている", "期限と物理的に整合している", "作業の重みを伝える数値がある"],
    ng: ["工数の目安がない", "「軽めに」など数値なし", "期限まで工数が収まらない矛盾"],
  },
  constraints_notes: {
    good: ["NG事項が具体的に明記", "優先順位がある", "使用すべきテンプレ・ツールが指定されている"],
    ng: ["後出し条件が発生する", "前提が共有されていない", "何がNGか分からない"],
  },
};

export default function MethodPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-xs uppercase tracking-widest text-accent">Method</div>
        <h1 className="mt-3 max-w-3xl font-serif text-5xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
          6観点 × 5段階で、
          <br />
          指示の <span className="text-accent">迷いにくさ</span> を測る。
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          各観点1〜5点・合計最大30点。評価項目と構造化項目を一致させることで、
          「どこを直せばよいか」が一目で分かる設計です。
        </p>

        {/* Score scale */}
        <div className="mt-16">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            スコアリング基準
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className="rounded-sm border border-border bg-card p-5 transition-transform hover:-translate-y-1"
              >
                <div
                  className={`mb-3 flex h-12 w-12 items-center justify-center rounded-sm font-serif text-xl font-semibold text-white score-bg-${n}`}
                >
                  {n}
                </div>
                <div className="text-sm font-medium">{SCORE_LABELS[n]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 4 perspectives detail */}
        <div className="mt-20 space-y-6">
          {PERSPECTIVES.map((p, i) => {
            const ex = goodNg[p.key];
            return (
              <div
                key={p.key}
                className="overflow-hidden rounded-sm border border-border bg-card shadow-paper"
              >
                <div className="grid border-b border-border md:grid-cols-12">
                  <div className="border-b border-border bg-foreground p-8 text-background md:col-span-4 md:border-b-0 md:border-r">
                    <div className="font-mono text-xs text-accent">
                      観点 0{i + 1} / {p.subLabel}
                    </div>
                    <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight">
                      {p.label}
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-background/70">
                      {p.description}
                    </p>
                  </div>
                  <div className="grid gap-px bg-border md:col-span-8 md:grid-cols-2">
                    <div className="bg-card p-6">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full score-bg-5 text-xs text-white">
                          ✓
                        </span>
                        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          良い状態
                        </span>
                      </div>
                      <ul className="mt-3 space-y-2 text-sm leading-relaxed">
                        {ex.good.map((g) => (
                          <li key={g} className="flex gap-2">
                            <span className="score-text-5">●</span>
                            {g}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-card p-6">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full score-bg-1 text-xs text-white">
                          ✗
                        </span>
                        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          NG状態
                        </span>
                      </div>
                      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                        {ex.ng.map((g) => (
                          <li key={g} className="flex gap-2">
                            <span className="score-text-1">●</span>
                            {g}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Important note */}
        <div className="mt-16 rounded-sm border-l-4 border-accent bg-accent/5 p-8">
          <div className="font-serif text-xl font-semibold text-foreground">
            重要：評価の原則
          </div>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-foreground/80">
            <li>
              ・<strong>正しさではなく「迷いにくさ」</strong>で評価する
            </li>
            <li>
              ・<strong>断定ではなく「不足の可能性」</strong>として指摘する
            </li>
            <li>・点数を上げることが目的ではなく、担当者の迷いを減らすことが目的</li>
            <li>・点数未達でもGO（確定）は可能。判断と責任は人が持つ</li>
          </ul>
        </div>

        <div className="mt-12 flex justify-center">
          <Link
            href="/workflow"
            className="inline-flex items-center gap-3 rounded-sm bg-foreground px-6 py-3.5 text-sm font-medium text-background hover:opacity-90"
          >
            評価を体験する →
          </Link>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
