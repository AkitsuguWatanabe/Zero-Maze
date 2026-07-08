import type { AssigneeRank } from "@/lib/mock-data";

export const RANK_COLORS: Record<string, string> = {
  A: "bg-green-100 text-green-800",
  B: "bg-blue-100 text-blue-800",
  C: "bg-amber-100 text-amber-800",
  D: "bg-red-100 text-red-800",
};

export function RankBadge({ rank }: { rank: AssigneeRank }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-mono font-bold ${RANK_COLORS[rank]}`}>
      {rank}
    </span>
  );
}
