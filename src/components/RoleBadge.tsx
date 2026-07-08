export const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800",
  reseller_admin: "bg-blue-100 text-blue-800",
  tenant_admin: "bg-amber-100 text-amber-800",
  team_leader: "bg-green-100 text-green-800",
  member: "bg-muted text-muted-foreground",
};

export function RoleBadge({ role, label }: { role: string; label: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}
