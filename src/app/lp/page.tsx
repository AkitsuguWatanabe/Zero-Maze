import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteHeader";
import { PERSPECTIVES } from "@/lib/mock-data";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  // ルートレイアウトの共通サフィックス（— 指示作成支援システム）を継承すると
  // 55文字前後になり検索結果で省略されるため、absoluteでこのページ独自のtitleにする
  title: { absolute: "Zero-Maze｜管理職の指示力を鍛えるAIトレーニング" },
  description:
    "新任管理職から拠点長・PM/PLリーダーまで、部下に指示を出すすべての方へ。曖昧な指示が生む手戻り・確認往復をAIが可視化し、6観点で指示品質をスコアリングします。資料請求・お問い合わせはこちらから。",
  alternates: { canonical: "https://app-lp.zero-maze.com/lp" },
  openGraph: {
    title: "Zero-Maze — 管理職の「指示力」を鍛えるAIトレーニング＆業務品質可視化システム",
    description: "指示の曖昧さをAIが可視化し、担当者の迷いと手戻りを減らす、管理職向けの指示作成支援システム。",
  },
};

export default function LandingPage() {
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
              <div className="flex items-center gap-2.5 text-xl font-semibold text-foreground md:text-2xl">
                <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                部下やチームに指示を出す、すべての管理職・リーダーへ。
              </div>
              <h1 className="mt-5 font-serif text-5xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-6xl lg:text-7xl">
                指示の質が、
                <br />
                <span className="relative inline-block">
                  利益を決める。
                  <span className="absolute -bottom-2 left-0 h-1 w-full bg-accent/70" />
                </span>
              </h1>
              <p className="mt-8 max-w-xl text-lg font-medium leading-relaxed text-foreground">
                企業の利益は、組織の生産性で決まります。組織の生産性は、日々の「指示」の質で決まります。
                ところが指示の質は、これまでほとんどの企業で見過ごされてきました。
              </p>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-foreground md:text-lg">
                Zero-Maze は、新任管理職から拠点長・支店長、PM・PLリーダーまで、
                部下やチームメンバーに指示を出すすべての方のための、
                <strong className="font-medium text-foreground">AI型「指示力」トレーニング＆業務品質可視化システム</strong>です。
                AIが指示の曖昧さを6つの観点で可視化し、担当者が迷わず動ける指示づくりを支援することで、
                組織の生産性——そして利益を底上げします。
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <a
                  href="#contact"
                  className="group inline-flex items-center gap-3 rounded-sm bg-foreground px-6 py-3.5 text-sm font-medium text-background shadow-elevated transition-transform hover:-translate-y-0.5"
                >
                  資料請求・お問い合わせ
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </a>
                <a
                  href="#personas"
                  className="inline-flex items-center gap-2 rounded-sm border border-border bg-card px-6 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  自分に当てはまるか見る
                </a>
              </div>

              <div className="mt-14 border-t border-border pt-8">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  数字で見るZero-Maze
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-6">
                  <Stat value="50" suffix="h/月" label="削減見込 (5名規模)" />
                  <Stat value="−50%" label="確認往復回数" />
                  <Stat value="6観点" label="30点満点スコア" />
                </dl>
              </div>
            </div>

            {/* Right: Mock UI preview */}
            <div className="relative lg:col-span-5">
              <div className="absolute -inset-4 rounded-lg bg-gradient-ink opacity-10 blur-2xl" />
              <div className="relative rounded-lg border border-border bg-card shadow-elevated">
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
                      <span className="text-4xl font-semibold leading-none text-foreground">27</span>
                      <span className="text-sm text-muted-foreground">/30</span>
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      <span>↑ +19</span>
                      <span className="text-accent/60">改善後</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 px-6 py-4">
                  {(
                    [
                      { i: 0, before: 1, after: 5 },
                      { i: 1, before: 2, after: 5 },
                      { i: 2, before: 1, after: 4 },
                      { i: 3, before: 1, after: 5 },
                      { i: 4, before: 1, after: 4 },
                      { i: 5, before: 2, after: 4 },
                    ]
                  ).map((bar) => {
                    const p = PERSPECTIVES[bar.i];
                    return (
                      <div key={p.key}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-baseline gap-1.5">
                            <span className="truncate text-xs font-medium">{p.label}</span>
                            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground/60">{p.subLabel}</span>
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

                <div className="space-y-2 border-t border-border bg-muted/30 px-6 py-4">
                  <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">AIからの改善コメント</div>
                  <div className="rounded-sm border-l-2 border-accent bg-card p-2.5 text-[11px] leading-relaxed text-foreground">
                    <span className="font-semibold text-foreground">依頼内容・作業内容：</span>
                    「昨年の展示会資料をベースに」「新製品Xの特長3点を追加」など、参考資料と作業範囲が明確になりました。
                  </div>
                  <div className="rounded-sm border-l-2 border-border bg-card p-2.5 text-[11px] leading-relaxed text-foreground">
                    <span className="font-semibold text-foreground">完了条件・成果物：</span>
                    PDF＋印刷用データ、確認者を経て印刷会社へ入稿、と成果物までの流れが定義されています。
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full score-bg-5" />
                    指示レベル別合格基準（A:12〜D:27点）
                  </div>
                  <div className="font-mono text-xs uppercase tracking-widest text-foreground">
                    指示の確定 →
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Personas */}
      <section id="personas" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs uppercase tracking-widest text-accent">Who</div>
          <h2 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">
            こんな方におすすめです
          </h2>
          <p className="mt-4 text-foreground">
            Zero-Maze は、次のような立場で「指示を出す」機会がある方を主な対象としています。
          </p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "新任管理職・リーダー", d: "初めて部下を持ち、指示の出し方に自信が持てない方。" },
            { t: "拠点長・支店長", d: "複数の営業職員やスタッフへ、日々指示を出す立場の方。" },
            { t: "PM・PLリーダー", d: "プロジェクトメンバーへのタスク依頼で、手戻りや確認往復を減らしたい方。" },
            { t: "人事・研修担当者", d: "管理職研修やOJTの仕組みを、属人的でなく標準化したい方。" },
          ].map((persona, i) => (
            <div key={persona.t} className="rounded-sm border border-border bg-card p-6">
              <div className="font-serif text-2xl font-semibold text-accent/70">0{i + 1}</div>
              <h3 className="mt-3 font-serif text-lg font-semibold text-foreground">{persona.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{persona.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Necessity */}
      <section id="necessity" className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-12 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-accent">Why now</div>
              <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight md:text-4xl">
                なぜ、今
                <br />
                「指示力」が問われるのか。
              </h2>
              <p className="mt-6 leading-relaxed text-muted-foreground">
                指示の出し方は、これまで現場の勘やOJTに委ねられてきました。
                しかし働き方や技術環境の変化が、その前提を崩し始めています。
              </p>
            </div>
            <div className="grid gap-3">
              {[
                {
                  t: "生成AIの普及が、曖昧さを増幅する",
                  d: "誰でも自然な文章がすぐ書けるようになった分、曖昧な指示がそのまま通り、後工程で綻びが表面化しやすくなっています。",
                },
                {
                  t: "OJT・対面指導が機能しにくくなっている",
                  d: "リモートワークや多拠点化により、「隣で教える」という再現性のない育成に頼れなくなっています。",
                },
                {
                  t: "人手不足が、手戻りコストを致命的にする",
                  d: "一人当たりの負荷が上がる中、確認の往復や手戻りは、そのまま組織全体の生産性損失に直結します。",
                },
              ].map((item, i) => (
                <div
                  key={item.t}
                  className="flex items-start gap-4 rounded-sm border border-border bg-card p-4"
                >
                  <div className="font-serif text-2xl font-semibold text-accent/70">
                    0{i + 1}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-foreground">{item.t}</div>
                    <div className="mt-1 text-sm leading-relaxed text-foreground">
                      {item.d}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 実例：指示の変化 */}
      <section id="example" className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              Zero-Mazeが変えること
            </div>
            <p className="mt-5 font-serif text-xl italic leading-relaxed text-muted-foreground md:text-2xl">
              「展示会の資料、いつもの感じでよろしく。来月までに。」
            </p>
            <h2 className="mt-4 font-serif text-3xl font-semibold leading-tight md:text-4xl">
              よくあるこの一言が、
              <br />
              「迷わない指示」に変わります。
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              現場でよくある何気ない一言も、Zero-Mazeを通すだけで、
              担当者が読んだだけで着手できる指示に変わります。
            </p>
          </div>

          <div className="mt-14 grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
            {/* そのまま送った場合 */}
            <div className="rounded-lg border border-destructive/30 bg-card p-6 shadow-paper">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">そのまま送った場合</span>
                <span className="shrink-0 rounded-full bg-destructive/10 px-3 py-1 text-sm font-bold text-destructive">8点 / 30点</span>
              </div>
              <p className="mt-4 rounded-sm bg-muted/50 p-4 text-sm leading-relaxed text-foreground">
                「展示会の資料、いつもの感じでよろしく。来月までに。」
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-foreground">
                <li>・「いつもの感じ」＝形式・分量・参考資料が不明</li>
                <li>・「来月までに」＝提出日・ドラフト有無が不明</li>
                <li>・確認事項やNG表現などの制約が書かれていない</li>
              </ul>
              <p className="mt-4 text-xs font-medium text-destructive">
                → 担当者は確認のため何度も聞き返すことになります
              </p>
            </div>

            {/* スコア差分バッジ（接続） */}
            <div className="flex flex-row items-center justify-center gap-2 lg:flex-col lg:gap-1">
              <span className="text-2xl text-muted-foreground lg:hidden">↓</span>
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 border-accent bg-accent/10">
                <span className="font-serif text-lg font-bold leading-none text-accent">+19</span>
                <span className="text-[10px] leading-none text-accent/70">点</span>
              </div>
              <span className="hidden text-2xl text-muted-foreground lg:block">→</span>
              <span className="text-xs font-medium text-muted-foreground">Zero-Mazeで整えると</span>
            </div>

            {/* Zero-Mazeで整えた場合 */}
            <div className="rounded-lg border border-accent/40 bg-card p-6 shadow-elevated">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">Zero-Mazeで整えた場合</span>
                <span className="shrink-0 rounded-full bg-accent/10 px-3 py-1 text-sm font-bold text-accent">27点 / 30点</span>
              </div>
              <div className="mt-4 space-y-2.5">
                <AfterLine label="目的・背景" text="来月の◯◯展示会でブース来場者へ配布する会社紹介資料。新製品Xの認知向上が目的。" />
                <AfterLine label="依頼内容" text="昨年の展示会資料（添付A）をベースに、新製品Xの特長3点を追加したA4両面資料を作成。" />
                <AfterLine label="完了条件・成果物" text="PDF1部＋印刷用データ一式。私の確認後に印刷会社へ入稿。" />
                <AfterLine label="期限" text="6/20（金）17時までに一次ドラフト、6/24（火）までに最終版。" />
                <AfterLine label="見込み工数" text="半日程度を想定。" />
                <AfterLine label="注意点・制約" text="ロゴ・カラーは最新ガイドライン（添付B）準拠。価格情報は記載不可。" />
              </div>
              <p className="mt-4 text-xs font-medium text-accent">
                → 担当者は追加の質問なしで、そのまま着手できます
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Flow */}
      <section className="border-b border-border bg-foreground text-background">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid items-end gap-12 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-widest text-accent">The Flow</div>
              <h2 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">
                指示概要入力 → 評価・改善 → プレビュー → 指示の確定
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-background">
              本システムは判断を代替しません。AIは評価・構造化・改善コメントを示し、
              最終的な指示の確定と、その責任は必ず指示者が持ちます。
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-sm bg-background/20 md:grid-cols-4">
            {[
              { n: "①", t: "指示概要入力", d: "走り書き・箇条書きで指示概要を入力。担当者・モード・緊急度を設定" },
              { n: "②", t: "評価・改善", d: "AIが6項目を抽出・評価。構造化結果と評価コメントを左右対応で表示。概要を修正して再評価" },
              { n: "③", t: "プレビュー", d: "合格後のみ表示。構造化データと最終指示文を2画面で確認・編集" },
              { n: "④", t: "指示の確定", d: "3層データをDBに保存。テキストをコピーして担当者に共有" },
            ].map((step) => (
              <div key={step.n} className="bg-foreground p-6">
                <div className="font-serif text-3xl text-accent">{step.n}</div>
                <div className="mt-3 font-medium">{step.t}</div>
                <div className="mt-1 text-xs text-background">{step.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs uppercase tracking-widest text-accent">Features</div>
          <h2 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">
            AIが指示を評価し、管理職の「指示力」を鍛える
          </h2>
          <p className="mt-4 text-foreground">
            正しさではなく <strong className="text-foreground">迷いにくさ</strong> を評価する。
            各観点1〜5点・合計30点満点。担当者の指示レベルで合格基準が変わります。
          </p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {PERSPECTIVES.map((p, i) => (
            <PerspectiveCard key={p.key} p={p} i={i} />
          ))}
        </div>

        <div className="mt-16 border-t border-border pt-12">
          <h3 className="text-center font-serif text-xl font-semibold md:text-2xl">
            評価だけでなく、育成・運用まで支える機能
          </h3>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "担当者ランク別の評価基準", d: "自走〜要指導まで、担当者の力量に応じて評価の厳しさが変わるので、育成段階に合った指示力を鍛えられます。" },
              { t: "効率モード／育成モード", d: "急ぎの業務は代筆に近い「効率モード」、育成を重視する場面は問いかけ中心の「育成モード」を選べます。" },
              { t: "指示テンプレートの保存", d: "よく使う指示のひな形を保存し、次回から素早く呼び出せます。" },
              { t: "チーム・全社のスコア推移", d: "個人だけでなくチーム・組織全体の指示品質の推移を継続的に把握できます。" },
            ].map((f) => (
              <div key={f.t} className="rounded-sm border border-border bg-card p-5">
                <h4 className="text-base font-semibold text-foreground">{f.t}</h4>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advantage */}
      <section id="advantage" className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="text-xs uppercase tracking-widest text-accent">Why Zero-Maze</div>
            <h2 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">
              OJTでも、汎用AIチャットでもない。
            </h2>
            <p className="mt-4 text-foreground">
              指示力を鍛える方法はいくつかありますが、Zero-Mazeにはそれぞれにない強みがあります。
            </p>
          </div>

          <div className="mt-14 overflow-x-auto rounded-xl border-2 border-accent/30 shadow-elevated">
            <table className="w-full min-w-[680px] border-collapse bg-card text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-muted/50">
                  <th className="px-5 py-5 text-left font-semibold text-foreground">比較項目</th>
                  <th className="px-5 py-5 text-left font-semibold text-foreground">OJT・対面指導</th>
                  <th className="px-5 py-5 text-left font-semibold text-foreground">汎用AIチャットに依頼</th>
                  <th className="border-l-2 border-accent/30 bg-accent px-5 py-5 text-left text-base font-bold text-accent-foreground">
                    Zero-Maze
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: "再現性（属人化しないか）",
                    ojt: ["×", "教える人次第で内容がばらつく"],
                    ai: ["△", "その場限りの応答で残らない"],
                    zm: ["○", "6観点で評価基準を標準化"],
                  },
                  {
                    label: "評価の定量化",
                    ojt: ["×", "感覚的な指摘にとどまる"],
                    ai: ["×", "スコアという概念がない"],
                    zm: ["○", "30点満点でスコア化"],
                  },
                  {
                    label: "組織全体の可視化",
                    ojt: ["×", "個別育成にとどまる"],
                    ai: ["×", "履歴が個人のチャットに埋もれる"],
                    zm: ["○", "チーム・全社の推移を可視化"],
                  },
                  {
                    label: "教育と実務の両立",
                    ojt: ["△", "育成中は業務が止まりがち"],
                    ai: ["○", "代筆はできるが育成にならない"],
                    zm: ["○", "効率／育成モードを切替可能"],
                  },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <td className="px-5 py-5 font-semibold text-foreground">{row.label}</td>
                    <ComparisonCell mark={row.ojt[0]} text={row.ojt[1]} />
                    <ComparisonCell mark={row.ai[0]} text={row.ai[1]} />
                    <ComparisonCell mark={row.zm[0]} text={row.zm[1]} highlight />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Related content — 相互リンク */}
      <section id="related" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-xs uppercase tracking-widest text-accent">関連コンテンツ</div>
          <h2 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">
            課題の背景や診断ツールも、あわせてご覧いただけます
          </h2>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            {
              href: "https://zero-maze.com",
              t: "課題を知る",
              site: "zero-maze.com",
              d: "確認・手戻り・再説明にかかる組織コストを解説。管理職・PM/PLリーダー向けの課題提起ページです。",
            },
            {
              href: "https://zero-maze.jp",
              t: "実態調査レポート",
              site: "zero-maze.jp",
              d: "314名を対象にした実態調査レポートを無料配布。組織運営の実態データがわかります。",
            },
            {
              href: "https://olds.zero-maze.com",
              t: "組織ロス自己診断",
              site: "olds.zero-maze.com",
              d: "いくつかの質問で、自社の「組織ロス」を無料でセルフチェックできるツールです。",
            },
          ].map((c) => (
            <a
              key={c.site}
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-sm border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-elevated"
            >
              <div className="font-mono text-xs text-muted-foreground">{c.site}</div>
              <h3 className="mt-2 text-base font-semibold text-foreground">{c.t}</h3>
              <p className="mt-2 text-xs leading-relaxed text-foreground">{c.d}</p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent">
                見る
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="mx-auto max-w-3xl px-6 py-24">
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-accent">Contact</div>
          <h2 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">
            資料請求・お問い合わせ
          </h2>
          <p className="mt-4 text-foreground">
            導入検討中の企業様・詳細資料をご希望の企業様は、以下のフォームよりお気軽にお問い合わせください。
          </p>
        </div>
        <div className="mt-10">
          <ContactForm />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function AfterLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-sm border-l-2 border-accent bg-muted/30 p-2.5">
      <span className="text-xs font-medium text-foreground">{label}：</span>
      <span className="text-xs leading-relaxed text-foreground">{text}</span>
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
      <p className="mt-3 text-sm leading-relaxed text-foreground">{p.description}</p>
      <div className="mt-6 flex gap-1">
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <div key={n} className={`h-1 flex-1 rounded-full score-bg-${n}`} />
        ))}
      </div>
    </div>
  );
}

function ComparisonCell({ mark, text, highlight = false }: { mark: string; text: string; highlight?: boolean }) {
  const markColor = mark === "○" ? "text-accent" : mark === "△" ? "text-foreground" : "text-destructive";
  return (
    <td className={`px-5 py-5 align-top ${highlight ? "border-l-2 border-accent/30 bg-accent/10" : ""}`}>
      <span className={`font-bold ${markColor}`}>{mark}</span>
      <span className={`ml-2 text-sm leading-relaxed text-foreground ${highlight ? "font-medium" : ""}`}>{text}</span>
    </td>
  );
}

function Stat({ value, suffix, label }: { value: string; suffix?: string; label: string }) {
  return (
    <div>
      <div className="font-serif text-3xl font-semibold text-foreground">
        {value}
        {suffix && <span className="ml-0.5 text-sm font-medium text-foreground">{suffix}</span>}
      </div>
      <div className="mt-1 text-xs font-medium text-foreground">{label}</div>
    </div>
  );
}
