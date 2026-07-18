// Client-side heuristics that catch obvious PII / company-name patterns
// before the "指示概要" text leaves the browser. This is a soft, imperfect
// gate — see SECURITY_PREAMBLE in evaluate-core.ts for the second-layer
// (AI-side) safety net that catches what this regex layer misses.

export type PiiKind = "company" | "person" | "email" | "phone";

export interface PiiMatch {
  text: string;
  kind: PiiKind;
}

export const PII_KIND_LABEL: Record<PiiKind, string> = {
  company: "会社名らしき表記",
  person: "氏名らしき表記（様付き）",
  email: "メールアドレス",
  phone: "電話番号らしき表記",
};

// Excludes hiragana on purpose: company names are typically kanji/katakana,
// and including hiragana here would greedily swallow trailing particles
// (の/と/を/…) and run the match on into the rest of the sentence.
const COMPANY_NAME_CHARS = "[A-Za-z0-9一-龠ァ-ヶー・]";
const COMPANY_RE = new RegExp(
  `(?:株式会社|合同会社|有限会社|㈱|（株）|\\(株\\))${COMPANY_NAME_CHARS}{0,15}` +
    `|${COMPANY_NAME_CHARS}{1,15}(?:株式会社|合同会社|有限会社|㈱|（株）|\\(株\\))`,
  "g",
);
// Informal in-house abbreviation like "ローヤル社" (no legal-entity suffix).
// Requires 2+ leading chars so common single-kanji + 社 words (本社/弊社/
// 貴社/自社/他社/御社/当社/同社/全社/一社/各社/入社/退社/商社/会社) are
// naturally excluded — those still slip through as 2+-char compounds
// (子会社/親会社/関連会社 etc.), so those are blocklisted explicitly below.
const GENERIC_COMPANY_SUFFIX_RE = new RegExp(`${COMPANY_NAME_CHARS}{2,10}社`, "g");
const GENERIC_COMPANY_BLOCKLIST = new Set([
  "子会社",
  "親会社",
  "関連会社",
  "グループ会社",
  "持株会社",
  "同業他社",
  "取引先各社",
  "系列会社",
]);
// Excludes hiragana for the same reason as COMPANY_NAME_CHARS above: names
// are written in kanji/katakana, and including hiragana let this greedily
// back-scan through an adjacent company name whenever there was no
// intervening particle within the 10-char window (e.g. "ローヤル株式会社の
// 田中様" matched "ーヤル株式会社の田中様" as the "person" instead of just
// "田中様", because の alone didn't stop a hiragana-inclusive class).
const PERSON_HONORIFIC_RE = new RegExp(`${COMPANY_NAME_CHARS}{1,10}様`, "g");
// "さん" is at least as common as "様" in everyday business Japanese
// ("南部さんに確認して") but wasn't covered at all before this.
const PERSON_SAN_RE = new RegExp(`${COMPANY_NAME_CHARS}{1,10}さん`, "g");
// Local/domain parts restricted to actual email characters — Japanese
// sentences have no whitespace, so a "non-whitespace" class here would
// greedily swallow the surrounding sentence instead of just the address.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /0\d{1,4}-\d{1,4}-\d{4}|0\d{9,10}/g;

// Honorific-only phrases that aren't a person's name and would otherwise be
// false positives for PERSON_HONORIFIC_RE.
const HONORIFIC_BLOCKLIST = new Set([
  "お客様",
  "客様", // "お客様" with the leading hiragana お dropped by PERSON_HONORIFIC_RE
  "ご担当者様",
  "担当者様",
  "皆様",
  "各位様",
  "関係者様",
  "保護者様",
  "会員様",
  "利用者様",
]);
// Same idea for PERSON_SAN_RE — generic relations/roles, not real names.
const SAN_BLOCKLIST = new Set([
  "皆さん",
  "みなさん",
  "お客さん",
  "客さん", // お客さん with the leading お dropped, same reason as 客様 above
  "母さん",
  "父さん",
  "兄さん",
  "姉さん",
  "叔父さん",
  "叔母さん",
  "おじさん",
  "おばさん",
]);

// Curated list of well-known Japanese company names that don't reliably
// carry a 株式会社/(株)/〜社 suffix in everyday usage (e.g. "日本生命",
// "トヨタ"), so none of the pattern-based regexes above can catch them —
// there's no textual marker to key off, only the fact that the string
// itself is a known proper noun. This is necessarily a finite, curated
// spot-check list (major/listed companies), not general-purpose company
// recognition — smaller or less-known companies, and informal
// abbreviations not listed here, still rely on Layer 2 (the AI-side
// anonymization instruction in evaluate-core.ts) as the actual backstop.
// Longer/more specific names are listed ahead of shorter ones sharing a
// prefix isn't required for correctness (matches are independent), but is
// kept for readability.
const KNOWN_COMPANY_NAMES = [
  // 生命保険・損害保険
  "日本生命", "第一生命", "明治安田生命", "住友生命", "太陽生命", "富国生命",
  "大同生命", "ソニー生命", "かんぽ生命", "東京海上日動", "損保ジャパン",
  "三井住友海上", "あいおいニッセイ同和損保",
  // 銀行・金融グループ
  "三菱UFJ銀行", "三井住友銀行", "みずほ銀行", "りそな銀行", "ゆうちょ銀行",
  "三菱UFJフィナンシャル・グループ", "三井住友フィナンシャルグループ",
  "みずほフィナンシャルグループ", "日本政策投資銀行", "商工中金",
  // 証券
  "野村證券", "大和証券", "SMBC日興証券", "みずほ証券", "楽天証券", "SBI証券", "松井証券",
  // 商社
  "伊藤忠商事", "三菱商事", "三井物産", "住友商事", "丸紅", "双日",
  // 自動車・輸送機器
  "トヨタ自動車", "トヨタ", "ホンダ", "本田技研工業", "日産自動車", "日産",
  "スズキ", "マツダ", "スバル", "三菱自動車", "いすゞ自動車", "ヤマハ発動機",
  "デンソー", "ブリヂストン",
  // 電機・精密機器
  "ソニー", "パナソニック", "日立製作所", "日立", "東芝", "富士通", "NEC",
  "シャープ", "キヤノン", "ニコン", "オリンパス", "京セラ", "村田製作所",
  "TDK", "任天堂", "セガ", "スクウェア・エニックス", "カプコン",
  // 通信・IT
  "NTT", "NTTドコモ", "KDDI", "ソフトバンク", "楽天モバイル", "LINEヤフー",
  "サイバーエージェント", "DeNA", "mixi", "リクルート",
  // 小売・EC
  "楽天", "イオン", "セブン&アイ・ホールディングス", "セブンイレブン", "ローソン",
  "ファミリーマート", "ユニクロ", "ファーストリテイリング", "ニトリ", "良品計画",
  "無印良品", "高島屋", "三越伊勢丹", "そごう西武",
  // 食品・飲料
  "アサヒビール", "キリンビール", "サントリー", "サッポロビール", "味の素",
  "日清食品", "キユーピー", "森永製菓", "江崎グリコ", "カルビー",
  // 「明治」は元号（明治時代など）と衝突するため意図的に除外
  // 医薬品
  "武田薬品工業", "武田薬品", "第一三共", "アステラス製薬", "中外製薬",
  "エーザイ", "大塚製薬",
  // 運輸・物流
  "JR東日本", "JR東海", "JR西日本", "JAL", "日本航空", "ANA", "全日空",
  "日本郵船", "商船三井", "川崎汽船", "ヤマト運輸", "佐川急便", "日本通運",
  // エネルギー・インフラ
  "東京電力", "関西電力", "中部電力", "ENEOS", "出光興産", "東京ガス", "大阪ガス",
  // 建設・不動産
  "大成建設", "鹿島建設", "清水建設", "大林組", "竹中工務店", "三井不動産",
  "三菱地所", "住友不動産", "東急不動産",
  // 鉄鋼・化学
  "日本製鉄", "JFEスチール", "三菱ケミカル", "住友化学", "旭化成", "東レ", "帝人",
  // その他大手
  "日本郵政", "日本たばこ産業", "JT", "リコー", "コニカミノルタ", "資生堂",
  "コーセー", "花王", "ライオン",
];

export function detectPii(text: string): PiiMatch[] {
  if (!text) return [];
  const matches: PiiMatch[] = [];
  const seen = new Set<string>();

  function push(kind: PiiKind, t: string) {
    const key = `${kind}:${t}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({ text: t, kind });
  }

  function collect(kind: PiiKind, re: RegExp, isValid: (t: string) => boolean = () => true) {
    for (const m of text.matchAll(re)) {
      const t = m[0];
      if (!isValid(t)) continue;
      push(kind, t);
    }
  }

  collect("email", EMAIL_RE);
  collect("phone", PHONE_RE);
  collect("company", COMPANY_RE);
  collect("company", GENERIC_COMPANY_SUFFIX_RE, (t) => !GENERIC_COMPANY_BLOCKLIST.has(t));
  collect("person", PERSON_HONORIFIC_RE, (t) => !HONORIFIC_BLOCKLIST.has(t));
  collect("person", PERSON_SAN_RE, (t) => !SAN_BLOCKLIST.has(t));

  for (const name of KNOWN_COMPANY_NAMES) {
    if (text.includes(name)) push("company", name);
  }

  return matches;
}

const COMPANY_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Best-effort placeholder replacement. Not guaranteed correct — callers must
// show the result to the user for review before it's actually submitted,
// rather than silently auto-sending it.
export function redactPii(text: string, matches: PiiMatch[]): string {
  if (!text) return text;
  let result = text;
  let companyIndex = 0;
  const companyMap = new Map<string, string>();

  for (const m of matches) {
    if (!result.includes(m.text)) continue;
    let replacement: string;
    if (m.kind === "company") {
      if (!companyMap.has(m.text)) {
        companyMap.set(m.text, `${COMPANY_LETTERS[companyIndex % COMPANY_LETTERS.length]}社`);
        companyIndex += 1;
      }
      replacement = companyMap.get(m.text)!;
    } else if (m.kind === "person") {
      replacement = "ご担当者様";
    } else if (m.kind === "email") {
      replacement = "（メールアドレス）";
    } else {
      replacement = "（電話番号）";
    }
    result = result.split(m.text).join(replacement);
  }
  return result;
}
