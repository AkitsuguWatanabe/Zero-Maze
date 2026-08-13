// 記入誘導型フォームの④完了条件・⑥注意点・制約（and ②背景, lightly）向けの、
// 送信をブロックしないやさしい指摘。pii-guard.tsのdetectPiiと異なり、
// これは提出前に強制するルールではなく、気づきを促すだけの非ブロッキングな
// ヒント。

export type AmbiguousMatch = { text: string };

const AMBIGUOUS_TERMS = [
  "適宜",
  "なるべく",
  "できるだけ",
  "いい感じに",
  "そのうち",
  "適当に",
  "うまく",
  "ある程度",
  "良きに",
  "なるはやで",
];

export function detectAmbiguousWords(text: string): AmbiguousMatch[] {
  if (!text) return [];
  const matches: AmbiguousMatch[] = [];
  const seen = new Set<string>();
  for (const term of AMBIGUOUS_TERMS) {
    if (seen.has(term)) continue;
    if (text.includes(term)) {
      seen.add(term);
      matches.push({ text: term });
    }
  }
  return matches;
}
