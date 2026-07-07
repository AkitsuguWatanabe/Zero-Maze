import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteHeader";
import { PERSPECTIVES } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "指示作成支援システム — 業務品質・生産性向上サポートプラットフォーム",
  description:
    "指示者の業務指示を構造化・可視化し、担当者の迷い・手戻りを削減する一次開発版システム。指示の品質を4観点でスコアリングします。",
  openGraph: {
    title: "指示作成支援システム",
    description: "指示の曖昧さを可視化し、担当者の迷いと手戻りを減らす。",
  },
};

export default function HomePage() {
  return (
    <div className="min-h-screen">

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-paper" />
        <img
          src="/hero-bg.jpg"
          alt=""
          aria-hidden="true"
          width={1920}
          height={1024}
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-40 mix-blend-multiply"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/80 to-background/30" />
        <div className="absolute right-0 top-0 -z-10 h-[600px] w-[600px] translate-x-1/3 -translate-y-1/4 rounded-full bg-primary/5 blur-3xl" />
        <div className="mx-auto max-w-7xl px-6 pb-24 pt-20 md:pt-28">
          <div className="grid items-center gap-16 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                指示の曖昧さを、可視化する。
              </div>
              <h1 className="mt-6 font-serif text-5xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-6xl lg:text-7xl">
                指示の質が、
                <br />
                <span className="relative inline-block">
                  業務の質を決める。
                  <span className="absolute -bottom-2 left-0 h-1 w-full bg-accent/70" />
                </span>
              </h1>
              <p className="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                指示の曖昧さが、手戻りを生みます。
                目的・成果物・期限・判断基準が不明確なまま依頼すると、担当者は迷い、確認の往復が増えます。
                Zero-Mazeは、指示を出す前に不足や曖昧さを確認し、<strong className="font-medium text-foreground">担当者が作業しやすい指示へ</strong>整えます。
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="/workflow"
                  className="group inline-flex items-center gap-3 rounded-sm bg-foreground px-6 py-3.5 text-sm font-medium text-background shadow-elevated transition-transform hover:-translate-y-0.5"
                >
                  指示を作成してみる
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
                <Link
                  href="/about"
                  className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-6 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  なぜ必要か
                </Link>
              </div>

              <dl className="mt-14 grid grid-cols-3 gap-6 border-t border-border pt-8">
                <Stat value="50" suffix="h/月" label="削減見込 (5名規模)" />
                <Stat value="−50%" label="確認往復回数" />
                <Stat value="6観点" label="30点満点スコア" />
              </dl>
            </div>

            {/* Right: Mock UI preview */}
            <div className="relative lg:col-span-5">
              <div className="absolute -inset-4 rounded-lg bg-gradient-ink opacity-10 blur-2xl" />
              <div className="relative rounded-lg border border-border bg-card shadow-elevated">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-6 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                      <div className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Quality Check / Step 02
                      </div>
                    </div>
                    <div className="mt-1.5 font-serif text-lg font-semibold">指示品質スコア</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      6観点 × 5段階で「迷いにくさ」を可視化
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-baseline justify-end gap-1 font-serif">
                      <span className="text-4xl font-semibold leading-none text-foreground">25</span>
                      <span className="text-sm text-muted-foreground">/30</span>
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      <span>↑ +18</span>
                      <span className="text-accent/60">改善後</span>
                    </div>
                  </div>
                </div>

                {/* Bars — 6 dimensions */}
                <div className="space-y-3 px-6 py-4">
                  {(
                    [
                      { i: 0, before: 2, after: 5 },
                      { i: 1, before: 1, after: 4 },
                      { i: 2, before: 1, after: 4 },
                      { i: 3, before: 1, after: 4 },
                      { i: 4, before: 1, after: 4 },
                      { i: 5, before: 1, after: 4 },
                    ]
                  ).map((bar) => {
                    const p = PERSPECTIVES[bar.i];
                    return (
                      <div key={p.key}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-baseline gap-1.5">
                            <span className="truncate text-xs font-medium">{p.label}</span>
                            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">{p.subLabel}</span>
                          </div>
                          <div className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
                            <span className="text-muted-foreground/50 line-through">{bar.before}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className={`font-semibold score-text-${bar.after}`}>{bar.after}.0</span>
                          </div>
                        </div>
                        <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20" style={{ width: `${(bar.before / 5) * 100}%` }} />
                          <div className={`absolute inset-y-0 left-0 rounded-full transition-all score-bg-${bar.after}`} style={{ width: `${(bar.after / 5) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* AI comments */}
                <div className="space-y-2 border-t border-border bg-muted/30 px-6 py-4">
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">AIからの改善コメント</div>
                  <div className="rounded-sm border-l-2 border-accent bg-card p-2.5 text-[11px] leading-relaxed text-foreground/80">
                    <span className="font-medium text-foreground">依頼内容・作業内容：</span>
                    形式・分量・構成が明示されました。各章のページ配分目安があると更に迷いが減ります。
                  </div>
                  <div className="rounded-sm border-l-2 border-border bg-card p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">完了条件・成果物：</span>
                    提出物・期限・完了判定が定義されています。承認者の明記を推奨。
                  </div>
                </div>

                {/* Footer action */}
                <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full score-bg-5" />
                    ランク別合格基準（A:12〜D:27点）
                  </div>
                  <div className="font-mono text-xs uppercase tracking-widest text-foreground">
                    Ready to GO →
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem section */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-accent">The Problem</div>
              <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight md:text-4xl">
                それは担当者の能力ではなく、
                <br />
                「指示の設計不足」です。
              </h2>
              <p className="mt-6 leading-relaxed text-muted-foreground">
                曖昧な指示は、認識のズレ・作業停止・手戻り・確認往復を生みます。
                教育やOJTでは再現性がなく、忙しい現場では定着しません。
                生成AIの普及はむしろ、曖昧さを増幅する可能性すらあります。
              </p>
            </div>
            <div className="grid gap-3">
              {[
                "目的・背景が書かれていない",
                "依頼内容の範囲・形式が不明確",
                "完了条件・成果物が定義されていない",
                "期限や見込み工数が示されていない",
                "注意点・制約が後出しになる",
              ].map((item, i) => (
                <div
                  key={item}
                  className="flex items-start gap-4 rounded-sm border border-border bg-card p-4"
                >
                  <div className="font-serif text-2xl font-semibold text-accent/70">
                    0{i + 1}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{item}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      → 担当者の迷い／手戻り／確認コスト
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4 perspectives */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs uppercase tracking-widest text-accent">The Method</div>
          <h2 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">
            6つの観点で「迷いにくさ」を測る
          </h2>
          <p className="mt-4 text-muted-foreground">
            正しさではなく <strong className="text-foreground">迷いにくさ</strong> を評価する。
            各観点1〜5点・合計30点満点。担当者ランクで合格基準が変わります。
          </p>
        </div>
        {/* 6 cards: 3 + 3 grid */}
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {PERSPECTIVES.map((p, i) => (
            <PerspectiveCard key={p.key} p={p} i={i} />
          ))}
        </div>
      </section>

      {/* Flow */}
      <section className="border-t border-border bg-foreground text-background">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid items-end gap-12 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-accent">The Flow</div>
              <h2 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">
                概要入力 → 評価・改善 → プレビュー → GO
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-background/70">
              本システムは判断を代替しません。AIは評価・構造化・改善コメントを示し、
              最終的なGO（確定）と責任は必ず指示者が持ちます。
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-sm bg-background/20 md:grid-cols-4">
            {[
              { n: "①", t: "指示概要入力", d: "走り書き・箇条書きで指示概要を入力。担当者・モード・緊急度を設定" },
              { n: "②", t: "評価・改善", d: "AIが6項目を抽出・評価。構造化結果と評価コメントを左右対応で表示。概要を修正して再評価" },
              { n: "③", t: "プレビュー", d: "合格後のみ表示。構造化データと最終指示文を2画面で確認・編集" },
              { n: "④", t: "GO（確定）", d: "3層データをDBに保存。テキストをコピーして担当者に共有" },
            ].map((step) => (
              <div key={step.n} className="bg-foreground p-6">
                <div className="font-serif text-3xl text-accent">{step.n}</div>
                <div className="mt-3 font-medium">{step.t}</div>
                <div className="mt-1 text-xs text-background/60">{step.d}</div>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              href="/workflow"
              className="inline-flex items-center gap-3 rounded-sm bg-accent px-6 py-3.5 text-sm font-medium text-accent-foreground shadow-elevated transition-transform hover:-translate-y-0.5"
            >
              フローを体験する
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function PerspectiveCard({ p, i }: { p: { key: string; subLabel: string; label: string; description: string }; i: number }) {
  return (
    <div className="group relative overflow-hidden rounded-sm border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-elevated">
      <div className="font-mono text-xs text-muted-foreground">
        0{i + 1} / {p.subLabel}
      </div>
      <h3 className="mt-3 font-serif text-xl font-semibold">{p.label}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
      <div className="mt-6 flex gap-1">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <div key={n} className={`h-1 flex-1 rounded-full score-bg-${n}`} />
        ))}
      </div>
    </div>
  );
}

function Stat({ value, suffix, label }: { value: string; suffix?: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-3xl font-semibold text-foreground">
        {value}
        {suffix && <span className="ml-0.5 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
