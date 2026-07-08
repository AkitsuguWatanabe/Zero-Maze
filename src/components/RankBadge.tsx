import type { AssigneeRank } from "@/lib/mock-data";

export const RANK_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  B: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  C: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  D: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function RankBadge({ rank }: { rank: AssigneeRank }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-mono font-bold ${RANK_COLORS[rank]}`}>
      {rank}
    </span>
  );
}
