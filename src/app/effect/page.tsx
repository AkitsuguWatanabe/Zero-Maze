import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "導入効果 — ROI試算と段階的導入ステップ",
  description: "確認往復・手戻り・作業時間の削減効果と、5名規模で月50時間削減の試算。",
  openGraph: {
    title: "導入効果 — 指示作成支援システム",
    description: "上司側は効率化、担当者側はロス削減。ROIの本体は担当者側にあります。",
  },
};

export default function EffectPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-xs uppercase tracking-widest text-accent">Effect</div>
        <h1 className="mt-3 max-w-3xl font-serif text-5xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
          見えないコストを、
          <br />
          見える削減に変える。
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          確認・修正・手戻り——日々の業務に埋もれている小さなロスは、
          積み上げると組織全体に大きな負荷を生みます。
        </p>

        {/* Big numbers */}
        <div className="mt-16 grid gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-3">
          <BigStat
            label="1指示あたりロス削減"
            value="20"
            unit="分"
            sub="着手前の迷い・作業中の迷い・手戻りの中央値"
          />
          <BigStat
            label="月間削減（担当者1名）"
            value="33"
            unit="時間"
            sub="100指示／月 × 20分（中央値）"
          />
          <BigStat
            label="月間削減（5名規模）"
            value="50"
            unit="時間"
            sub="チーム全体の認識ズレ・手戻り削減"
            accent
          />
        </div>

        {/* Before / After */}
        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="rounded-sm border border-border bg-card p-8">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Before — 現状
            </div>
            <h2 className="mt-2 font-serif text-2xl font-semibold">曖昧な指示の代償</h2>
            <table className="mt-6 w-full text-sm">
              <tbody>
                <Row label="着手前の迷い" value="5〜10 分" />
                <Row label="作業中の迷い" value="5〜15 分" />
                <Row label="手戻り" value="15〜30 分" />
                <Row label="確認往復" value="2〜3 回" />
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-foreground">
                  <td className="py-3 font-medium">合計ロス／指示</td>
                  <td className="py-3 text-right font-serif text-2xl font-semibold">
                    25〜50 分
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="rounded-sm border border-foreground bg-foreground p-8 text-background">
            <div className="text-xs uppercase tracking-widest text-accent">
              After — 改善後
            </div>
            <h2 className="mt-2 font-serif text-2xl font-semibold">明確な指示の効果</h2>
            <table className="mt-6 w-full text-sm">
              <tbody>
                <Row label="着手の早さ" value="↑ 早い" dark />
                <Row label="判断回数" value="↓ 減少" dark />
                <Row label="手戻り" value="↓ 半減" dark />
                <Row label="確認往復" value="↓ 半減" dark />
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-accent">
                  <td className="py-3 font-medium">削減ロス／指示</td>
                  <td className="py-3 text-right font-serif text-2xl font-semibold text-accent">
                    約 20 分
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ROI structure */}
        <div className="mt-20 rounded-sm border border-border bg-card p-10 shadow-paper">
          <div className="text-xs uppercase tracking-widest text-accent">ROI Structure</div>
          <h2 className="mt-3 font-serif text-3xl font-semibold">
            ROIの本体は、担当者側にある。
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div>
              <div className="font-medium">上司側</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                改善効果は<strong className="text-foreground">「効率化」</strong>。
                指示の質のばらつき低減、再指示・確認対応の減少。
              </p>
            </div>
            <div>
              <div className="font-medium text-accent">担当者側 ← 本丸</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                改善効果は<strong className="text-foreground">「ロス削減」</strong>。
                着手の迷い・手戻り・ストレスの削減。組織全体の生産性に直結します。
              </p>
            </div>
          </div>
        </div>

        {/* Rollout steps */}
        <div className="mt-20">
          <div className="text-xs uppercase tracking-widest text-accent">Rollout</div>
          <h2 className="mt-3 font-serif text-3xl font-semibold">段階的導入ステップ</h2>
          <div className="mt-8 space-y-3">
            {[
              { n: "①", t: "対象業務の選定", d: "手戻りが多い／指示が曖昧になりやすい業務" },
              { n: "②", t: "対象チームでの試験運用", d: "1〜2週間の試験期間" },
              { n: "③", t: "指標の測定", d: "確認回数・手戻り回数・作業時間" },
              { n: "④", t: "効果検証", d: "定量・定性両面での評価" },
              { n: "⑤", t: "展開判断", d: "継続／拡大の意思決定" },
            ].map((s) => (
              <div
                key={s.n}
                className="grid grid-cols-12 items-center gap-4 rounded-sm border border-border bg-card p-5 transition-colors hover:bg-muted/40"
              >
                <div className="col-span-2 font-serif text-3xl font-semibold text-accent">
                  {s.n}
                </div>
                <div className="col-span-4 font-medium">{s.t}</div>
                <div className="col-span-6 text-sm text-muted-foreground">{s.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-20 rounded-sm bg-gradient-ink p-12 text-center text-primary-foreground">
          <h2 className="font-serif text-3xl font-semibold leading-tight md:text-4xl">
            指示の質を、今日から変えていく。
          </h2>
          <p className="mt-4 text-sm text-primary-foreground/70">
            まずは1つの指示から。フローを体験してください。
          </p>
          <div className="mt-8">
            <Link
              href="/workflow"
              className="inline-flex items-center gap-3 rounded-sm bg-accent px-7 py-3.5 text-sm font-medium text-accent-foreground hover:opacity-90"
            >
              指示作成フローを試す →
            </Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function BigStat({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className={`p-8 ${accent ? "bg-foreground text-background" : "bg-card"}`}>
      <div
        className={`text-xs uppercase tracking-widest ${
          accent ? "text-accent" : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <div className="font-serif text-6xl font-semibold leading-none">{value}</div>
        <div className={`text-lg ${accent ? "text-background/70" : "text-muted-foreground"}`}>
          {unit}
        </div>
      </div>
      <div
        className={`mt-3 text-xs leading-relaxed ${
          accent ? "text-background/60" : "text-muted-foreground"
        }`}
      >
        {sub}
      </div>
    </div>
  );
}

function Row({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <tr className={`border-b ${dark ? "border-background/20" : "border-border"}`}>
      <td className={`py-3 ${dark ? "text-background/70" : "text-muted-foreground"}`}>
        {label}
      </td>
      <td className="py-3 text-right font-mono">{value}</td>
    </tr>
  );
}
