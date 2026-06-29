import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "コンセプト — なぜ「指示の質」か",
  description: "業務品質は担当者の能力ではなく、指示の明確さに大きく依存します。",
  openGraph: {
    title: "コンセプト — 指示作成支援システム",
    description: "属人化と曖昧さを仕組みで解消する設計思想。",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <article className="mx-auto max-w-4xl px-6 py-20">
        <div className="text-xs uppercase tracking-widest text-accent">Concept</div>
        <h1 className="mt-3 font-serif text-5xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
          属人化を、
          <br />
          仕組みで解消する。
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          指示の質は、これまで上司個人の経験と能力に依存してきました。
          本システムは、指示作成のプロセスそのものを構造化することで、
          再現性のある品質改善を実現します。
        </p>

        <Section
          eyebrow="01"
          title="現状の問題構造"
          body="企業の業務の大半は「上司が指示を出し、担当者が実行する」構造で成り立っています。しかし、その指示の質は標準化されておらず、担当者の迷い・解釈ズレ・手戻り・確認往復・上司の疲弊を生み続けています。"
          callout="これらは担当者の能力の問題ではなく、「指示の設計不足」の問題です。"
        />

        <Section
          eyebrow="02"
          title="従来の対策の限界"
          body="教育・研修・OJT・上司の経験依存——いずれも再現性がなく、個人差が大きく、忙しい現場では定着しません。「指示の作り方」が仕組み化されていないことが、本質的な原因です。"
        />

        <Section
          eyebrow="03"
          title="生成AI時代の新たな課題"
          body="担当者は生成AIで要約・手順化・調査ができるようになりました。しかし、元の指示が曖昧な場合、AIはもっともらしい誤解を生成し、認識ズレを増幅させます。入力の質が低いと、AIはそれを増幅するのです。"
          callout="だからこそ「入力＝指示」の質を、上流で整える必要があります。"
        />

        <Section
          eyebrow="04"
          title="本システムが解決すること"
          body="本システムは『指示の作成段階』を支援します。曖昧さの可視化、不足情報の抽出、誤解リスクの提示、修正を促す仕組みの提供——これらに特化します。業務の正解提示・判断の代替・人材評価は行いません。"
        />

        <Section
          eyebrow="05"
          title="設計思想"
          body="判断は人が行う。AIは評価と提案にとどまり、最終的なGO（確定）と責任は必ず上司が持ちます。点数は『正しさ』ではなく『迷いにくさ』を測るもの。短時間で改善できる、現場負担の小さい設計を貫きます。"
        />

        <div className="mt-20 rounded-sm border border-foreground bg-foreground p-10 text-background">
          <div className="text-xs uppercase tracking-widest text-accent">利用シーン</div>
          <h2 className="mt-3 font-serif text-3xl font-semibold">推奨される使い方</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-background/60">
                ✓ 推奨場面
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                <li>新規タスクの指示時</li>
                <li>複雑または重要度の高い業務指示</li>
                <li>過去に手戻りが発生した業務</li>
                <li>経験の浅い担当者への指示</li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-background/60">
                ✗ 非推奨場面
              </div>
              <ul className="mt-3 space-y-2 text-sm text-background/70">
                <li>定型業務</li>
                <li>単純作業</li>
                <li>緊急対応（時間優先）</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex justify-center">
          <Link
            href="/workflow"
            className="inline-flex items-center gap-3 rounded-sm bg-accent px-6 py-3.5 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            実際に試してみる →
          </Link>
        </div>
      </article>
      <SiteFooter />
    </div>
  );
}

function Section({
  eyebrow,
  title,
  body,
  callout,
}: {
  eyebrow: string;
  title: string;
  body: string;
  callout?: string;
}) {
  return (
    <section className="mt-16 grid gap-6 border-t border-border pt-10 md:grid-cols-12">
      <div className="md:col-span-3">
        <div className="font-mono text-xs text-muted-foreground">{eyebrow}</div>
        <h2 className="mt-2 font-serif text-2xl font-semibold leading-tight">{title}</h2>
      </div>
      <div className="md:col-span-9">
        <p className="text-base leading-relaxed text-foreground/80">{body}</p>
        {callout && (
          <blockquote className="mt-5 border-l-2 border-accent bg-accent/5 px-5 py-4 font-serif text-base italic text-foreground">
            {callout}
          </blockquote>
        )}
      </div>
    </section>
  );
}
