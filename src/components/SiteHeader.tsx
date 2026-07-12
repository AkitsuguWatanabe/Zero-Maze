"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, signOut } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth";
import { useTeam } from "@/lib/team-context";
import { RoleBadge } from "@/components/RoleBadge";

type Team = { id: string; name: string };

const ROLE_LABELS: Record<string, string> = {
  super_admin: "スーパー管理者",
  reseller_admin: "代理店管理者",
  tenant_admin: "テナント管理者",
  team_leader: "チームリーダー",
  member: "メンバー",
};

export function SiteHeader({ forceMarketing = false }: { forceMarketing?: boolean } = {}) {
  const pathname = usePathname();
  // forceMarketingはapp-lp.zero-maze.comのホスト名で判定した値（layout.tsx参照）。
  // middlewareがルート("/")を/lpへ書き換えてもusePathname()は"/"のままのため、
  // pathnameだけでは判定できないケースを補う。
  const isMarketingPage = forceMarketing || (pathname?.startsWith("/lp") ?? false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const { selectedTeamId, setSelectedTeamId } = useTeam();
  const [teams, setTeams] = useState<Team[]>([]);
  const [myRoles, setMyRoles] = useState<{ id: string; roleLabel: string; teamName: string | null }[]>([]);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);

  // Fetch user once on mount — SiteHeader is now in layout so it stays mounted.
  useEffect(() => {
    getUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setUserLoaded(true));
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { role?: string; tenantName?: string | null; activeRoleId?: string | null; hasMultipleRoles?: boolean }) => {
        setRole(d.role ?? null);
        setTenantName(d.tenantName ?? null);
        setActiveRoleId(d.activeRoleId ?? null);
        setIsOrgAdmin(["super_admin", "reseller_admin", "tenant_admin", "team_leader"].includes(d.role ?? ""));

        if (d.hasMultipleRoles) {
          fetch("/api/auth/my-roles")
            .then((r) => r.json())
            .then((rd: { roles?: { id: string; roleLabel: string; teamName: string | null }[] }) => {
              setMyRoles(rd.roles ?? []);
            })
            .catch(() => setMyRoles([]));
        } else {
          setMyRoles([]);
        }
      })
      .catch(() => setIsOrgAdmin(false));
  }, []);

  function handleRoleSwitch(roleId: string) {
    document.cookie = `zm_active_role_id=${roleId}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
  }

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

  // super_admin/reseller_adminはテナントに紐づかないため、テナント文脈が前提の
  // ナビ項目（指示作成・メンバー・助言）を見ても中身が空になる。表示自体を絞る。
  const NAV_ITEMS: { to: string; label: string; roles?: string[] }[] = [
    { to: "/workflow", label: "指示作成", roles: ["tenant_admin", "team_leader", "member"] },
    {
      to: "/members",
      label: "メンバー",
      roles: ["tenant_admin", "team_leader"],
    },
    { to: "/advice", label: "助言", roles: ["tenant_admin", "team_leader", "member"] },
  ];
  const nav = NAV_ITEMS.filter((n) => !n.roles || n.roles.includes(role ?? ""));

  const displayName = user?.display_name ?? user?.email?.split("@")[0] ?? "";
  // 20-10: このメニューを実際に読んで絞り込みに使っているページだけに表示する。
  // チーム管理・ユーザー管理などテナント全体を俯瞰する画面では無視されるため、
  // 表示したままだと「選べるのに効かない」という誤解を招く。
  const teamScopedPaths = ["/workflow", "/admin/progress", "/members"];
  const isTeamScopedPage = teamScopedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const showTeamSwitcher = role === "tenant_admin" && teams.length > 0 && isTeamScopedPage;

  // 製品紹介LP（/lp、app-lp.zero-maze.com）では、ログイン前提の内部ナビ
  // （指示作成・助言・管理画面等）を見せず、問い合わせ導線のみのヘッダーにする。
  if (isMarketingPage) {
    return (
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-6">
          <Link href="/lp" className="flex shrink-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-gradient-ink shadow-ink">
              <span className="font-serif text-base font-semibold text-primary-foreground">指</span>
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="font-serif text-[14px] font-semibold tracking-tight text-foreground">Zero-Maze</div>
            </div>
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <a
              href="#contact"
              className="inline-flex items-center rounded-sm bg-foreground px-3.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              お問い合わせ
            </a>
          </div>
        </div>
      </header>
    );
  }

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

        {/* Tenant name — always visible for misclick prevention (16-1 ⑤) */}
        {userLoaded && user && tenantName && (
          <div className="hidden items-center gap-2 border-l border-border/60 pl-4 md:flex">
            <span className="text-xs text-muted-foreground">利用中の企業</span>
            <span className="text-sm font-medium text-foreground">{tenantName}</span>
          </div>
        )}

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
                {active && <span className="ml-1 text-accent text-xs">●</span>}
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
              {pathname.startsWith("/admin") && <span className="ml-1 text-accent text-xs">●</span>}
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

                {/* Active role switcher — for users with multiple roles (兼務), e.g. member in one team + team_leader in another */}
                {myRoles.length > 1 && (
                  <select
                    value={activeRoleId ?? ""}
                    onChange={(e) => handleRoleSwitch(e.target.value)}
                    title="今の立場・チームを選択"
                    className="hidden sm:block rounded-sm border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground focus:border-foreground focus:outline-none"
                  >
                    {myRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.teamName ? `${r.teamName}（${r.roleLabel}）` : r.roleLabel}
                      </option>
                    ))}
                  </select>
                )}

                {/* CSV export — super_admin/reseller_adminはテナントに紐づかず対象データが無いため非表示 */}
                {role !== "super_admin" && role !== "reseller_admin" && (
                  <a
                    href="/api/export"
                    download
                    className="hidden sm:inline-flex items-center rounded-sm border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                    title="指示履歴をCSVでダウンロード"
                  >
                    CSV出力
                  </a>
                )}

                {/* Divider */}
                <span className="h-4 w-px bg-border" />

                {/* Role badge */}
                {role && <RoleBadge role={role} label={ROLE_LABELS[role] ?? role} />}

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

export function SiteFooter({ forceMarketing = false }: { forceMarketing?: boolean } = {}) {
  const pathname = usePathname();
  const isMarketingPage = forceMarketing || (pathname?.startsWith("/lp") ?? false);

  // 製品紹介LP（/lp）は、zero-maze.com/jp・olds.zero-maze.comと揃えたフッターにする
  // （黒背景・横一列レイアウト。項目は運営会社・連絡先・プライバシーポリシー・著作権表記）。
  if (isMarketingPage) {
    return (
      <footer className="mt-12 bg-neutral-950 text-neutral-400">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-gradient-ink shadow-ink">
                <span className="font-serif text-base font-semibold text-primary-foreground">指</span>
              </div>
              <div className="font-serif text-sm font-semibold text-white">Zero-Maze</div>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>
                運営会社：
                <a
                  href="https://www.gl-link.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:text-white hover:underline"
                >
                  グローバル・リンク株式会社
                </a>
              </span>
              <span className="text-neutral-600">／</span>
              <a href="mailto:zero-maze@gl-link.com" className="hover:text-white hover:underline">
                zero-maze@gl-link.com
              </a>
              <span className="text-neutral-600">／</span>
              <a
                href="https://zero-maze.com/privacy.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white hover:underline"
              >
                プライバシーポリシー
              </a>
            </div>
          </div>
          <div className="mt-4 text-xs">© {new Date().getFullYear()} グローバル・リンク株式会社 All Rights Reserved.</div>
        </div>
      </footer>
    );
  }

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