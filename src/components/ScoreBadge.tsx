import { SCORE_LABELS } from "@/lib/mock-data";

const SCORE_BG: Record<number, string> = {
  1: "score-bg-1",
  2: "score-bg-2",
  3: "score-bg-3",
  4: "score-bg-4",
  5: "score-bg-5",
};

export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-7 w-7 text-xs",
    md: "h-10 w-10 text-base",
    lg: "h-16 w-16 text-2xl",
  };
  return (
    <div className="flex items-center gap-2">
      <div
        className={`${sizes[size]} ${SCORE_BG[score]} flex items-center justify-center rounded-sm font-serif font-semibold text-white shadow-paper`}
      >
        {score}
      </div>
      {size !== "sm" && (
        <div className="text-xs text-muted-foreground">{SCORE_LABELS[score]}</div>
      )}
    </div>
  );
}

