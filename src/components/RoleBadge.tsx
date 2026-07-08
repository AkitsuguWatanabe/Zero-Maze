export const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  reseller_admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  tenant_admin: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  team_leader: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  member: "bg-muted text-muted-foreground",
};

export function RoleBadge({ role, label }: { role: string; label: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}
