"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, signOut } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";
import { useTeam } from "@/lib/team-context";

type Team = { id: string; name: string };

export function SiteHeader() {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const { selectedTeamId, setSelectedTeamId } = useTeam();
  const [teams, setTeams] = useState<Team[]>([]);

  // Fetch user once on mount — SiteHeader is now in layout so it stays mounted.
  useEffect(() => {
    getUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setUserLoaded(true));
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { role?: string }) => {
        setRole(d.role ?? null);
        setIsOrgAdmin(["super_admin", "reseller_admin", "tenant_admin"].includes(d.role ?? ""));
      })
      .catch(() => setIsOrgAdmin(false));
  }, []);

  // Only tenant_admin gets the team switcher: they manage a whole tenant
  // (potentially many teams) rather than belonging to one team themselves.
  useEffect(() => {
    if (role !== "tenant_admin") {
      setTeams([]);
      return;
    }
    fetch("/api/admin/teams")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTeams(Array.isArray(d) ? d : []))
      .catch(() => setTeams([]));
  }, [role]);

  // If the previously-selected team no longer exists (e.g. deleted), clear it.
  useEffect(() => {
    if (role !== "tenant_admin") return;
    if (selectedTeamId && teams.length > 0 && !teams.some((t) => t.id === selectedTeamId)) {
      setSelectedTeamId("");
    }
  }, [teams, selectedTeamId, role, setSelectedTeamId]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await signOut();
      window.location.href = "/login";
    } finally {
      setLoggingOut(false);
    }
  }

  const NAV_ITEMS: { to: string; label: string; roles?: string[] }[] = [
    { to: "/workflow", label: "指示作成" },
    {
      to: "/members",
      label: "メンバー",
      roles: ["super_admin", "reseller_admin", "tenant_admin", "team_leader"],
    },
    { to: "/advice", label: "助言" },
  ];
  const nav = NAV_ITEMS.filter((n) => !n.roles || n.roles.includes(role ?? ""));

  const displayName = user?.display_name ?? user?.email?.split("@")[0] ?? "";
  const showTeamSwitcher = role === "tenant_admin" && teams.length > 0;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-gradient-ink shadow-ink">
            <span className="font-serif text-base font-semibold text-primary-foreground">指</span>
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="font-serif text-[14px] font-semibold tracking-tight text-foreground">Zero-Maze</div>
          </div>
        </Link>

        {/* Nav */}
        <nav className="hidden flex-1 items-center gap-0.5 md:flex">
          {nav.map((n) => {
            const active = pathname === n.to || (n.to !== "/" && pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                href={n.to}
                className={`rounded-sm px-3 py-2 text-sm transition-colors ${
                  active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {n.label}
                {active && <span className="ml-1 text-accent text-[10px]">●</span>}
              </Link>
            );
          })}
          {isOrgAdmin && (
            <Link
              href="/admin"
              className={`rounded-sm px-3 py-2 text-sm transition-colors ${
                pathname.startsWith("/admin") ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              管理画面
              {pathname.startsWith("/admin") && <span className="ml-1 text-accent text-[10px]">●</span>}
            </Link>
          )}
        </nav>

        {/* Right side — only render after user state is known to avoid flash */}
        {userLoaded && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {user ? (
              <>
                {/* Team switcher — tenant_admin only */}
                {showTeamSwitcher && (
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    title="対象チームを選択"
                    className="hidden sm:block rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground focus:border-foreground focus:outline-none"
                  >
                    <option value="">全チーム</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                )}

                {/* CSV export */}
                
                  <a　href="/api/export"
                  download
                  className="hidden sm:inline-flex items-center rounded-sm border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                  title="指示履歴をCSVでダウンロード"
                >
                  CSV出力
                </a>

                {/* Divider */}
                <span className="h-4 w-px bg-border" />

                {/* User name */}
                <span className="hidden sm:block max-w-[120px] truncate text-xs text-muted-foreground" title={user.email}>
                  {displayName}
                </span>

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
                >
                  {loggingOut ? "…" : "ログアウト"}
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                ログイン
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-border/60 bg-gradient-to-b from-background to-muted/30">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-gradient-ink shadow-ink">
              <span className="font-serif text-base font-semibold text-primary-foreground">指</span>
            </div>
            <div className="font-serif text-sm font-semibold">Zero-Maze</div>
          </Link>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground md:flex-row md:items-center md:gap-4">
            <span className="font-serif italic tracking-wide">判断と責任は人が持つ。</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}