import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteHeader";
import { PERSPECTIVES } from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "指示作成支援システム — 業務品質・生産性向上サポートプラットフォーム",
  description:
    "作業概要・背景・期限を入力するだけで、AIが不足を補い伝わる指示文に仕上げる、一次開発版の指示作成支援システム。担当者の迷い・手戻りを削減します。",
  openGraph: {
    title: "指示作成支援システム",
    description: "3つの入力から、AIが伝わる指示文を仕上げる。担当者の迷いと手戻りを減らす。",
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
                3つの入力で、指示文が仕上がる。
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
                目的・成果物・期限が不明確なまま依頼すると、担当者は迷い、確認の往復が増えます。
                Zero-Mazeは、<strong className="font-medium text-foreground">①作業概要 ②背景 ③期限を入力するだけ</strong>で、AIが不足している情報を補い、伝わる指示文に仕上げます。
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="/workflow"
                  className="group inline-flex items-center gap-3 rounded-sm bg-foreground px-6 py-3.5 text-sm font-medium text-background shadow-elevated transition-transform hover:-translate-y-0.5"
                >
                  指示を作成してみる
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
                <a
                  href="#problem"
                  className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-6 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  なぜ必要か
                </a>
              </div>

              <dl className="mt-14 grid grid-cols-3 gap-6 border-t border-border pt-8">
                <Stat value="3" suffix="項目" label="入力するのは作業概要・背景・期限だけ" />
                <Stat value="6" suffix="観点" label="AIが自動でチェック・補完" />
                <Stat value="1" suffix="本" label="の完成した指示文に仕上がる" />
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
                        AI Completion
                      </div>
                    </div>
                    <div className="mt-1.5 font-serif text-lg font-semibold">AIが指示文を仕上げる</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      抜け漏れをAIが自動で補完
                    </div>
                  </div>
                  <div className="text-right space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                      実行可否 問題なし
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                      期限遵守 問題なし
                    </div>
                  </div>
                </div>

                {/* AI comments — one per perspective the model actually checks */}
                <div className="space-y-2 px-6 py-4">
                  {[
                    { p: PERSPECTIVES[1], note: "「A社向け提案資料」とだけありましたが、形式・分量が補われました。" },
                    { p: PERSPECTIVES[2], note: "提出物・期限・完了判定が定義されています。承認者の明記を推奨。" },
                    { p: PERSPECTIVES[3], note: "期限まで余裕があり、担当者の指示レベルでも十分に間に合います。" },
                  ].map(({ p, note }) => (
                    <div key={p.key} className="rounded-sm border-l-2 border-accent bg-muted/30 p-2.5 text-[11px] leading-relaxed">
                      <span className="font-medium text-foreground">{p.label}：</span>
                      <span className="text-foreground/80">{note}</span>
                    </div>
                  ))}
                </div>

                {/* Footer action */}
                <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
                  <div className="text-sm text-muted-foreground">
                    指示をどれだけ詳しく書く必要があるかを選ぶだけ（人事評価ではない）
                  </div>
                  <div className="font-mono text-xs uppercase tracking-widest text-foreground shrink-0">
                    Ready to GO →
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem section */}
      <section id="problem" className="border-y border-border bg-muted/30">
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
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6">
                <div>
                  <div className="font-serif text-3xl font-semibold text-foreground">73.1%</div>
                  <div className="mt-1 text-sm text-muted-foreground">PM・PLリーダー層が、1日1時間以上を不要なやり取りに費やしている</div>
                </div>
                <div>
                  <div className="font-serif text-3xl font-semibold text-foreground">52.2%</div>
                  <div className="mt-1 text-sm text-muted-foreground">指示の属人化に「問題がある」と回答</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                ※自社調査（2026年6月・IT/情報通信業、n=314、GMOリサーチ&AI協力）による回答者の主観に基づく数値です。業界全体を代表するものではありません。
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
                    <div className="mt-1 text-sm text-muted-foreground">
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
            正しさではなく <strong className="text-foreground">迷いにくさ</strong> を確認する。
            AIが問題なし／要確認／要対応の3段階で判定し、不足があればAIがその場で内容を補い、指示文に反映します。
            確認の厳しさは、担当者の指示レベルに応じて自動的に変わります。
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
                3つの入力 → AIが仕上げる → GO
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-background/70">
              本システムは判断を代替しません。AIは不足を補い指示文を仕上げますが、
              最終的な確定と責任は必ず指示者が持ちます。
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-sm bg-background/20 md:grid-cols-4">
            {[
              { n: "①", t: "指示概要入力", d: "作業概要・背景・期限を入力。担当者・モード・緊急度を設定" },
              { n: "②", t: "AIが確認・補完", d: "実行可否・期限遵守を判定。抜け漏れがあれば、AIがその場で内容を補う" },
              { n: "③", t: "指示文が完成", d: "AIが指示文を生成。内容を確認し、必要なら編集・再作成できる" },
              { n: "④", t: "GO（確定）", d: "指示文を保存し、テキストをコピーまたはメールで担当者に共有" },
            ].map((step) => (
              <div key={step.n} className="bg-foreground p-6">
                <div className="font-serif text-3xl text-accent">{step.n}</div>
                <div className="mt-3 font-medium">{step.t}</div>
                <div className="mt-1 text-sm text-background/80">{step.d}</div>
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
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
