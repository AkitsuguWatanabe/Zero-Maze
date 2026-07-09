"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteFooter } from "@/components/SiteHeader";

type MeResponse = {
  id?: string;
  email?: string;
  role?: string;
  tenantId?: string | null;
  isAdmin?: boolean;
};

const NAV_ITEMS: { to: string; label: (role: string) => string; roles: string[] }[] = [
  { to: "/admin/progress", label: () => "進捗", roles: ["tenant_admin", "team_leader", "super_admin", "reseller_admin"] },
  { to: "/admin/resellers", label: () => "代理店管理", roles: ["super_admin"] },
  {
    to: "/admin/tenants",
    label: (role) => (role === "reseller_admin" ? "顧客企業管理" : "テナント管理"),
    roles: ["super_admin", "reseller_admin"],
  },
  { to: "/admin/teams", label: () => "チーム管理", roles: ["super_admin", "tenant_admin"] },
  { to: "/admin/users", label: (role) => (role === "team_leader" ? "メンバー登録" : "ユーザー管理"), roles: ["super_admin", "reseller_admin", "tenant_admin", "team_leader"] },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: "スーパー管理者",
  reseller_admin: "代理店管理者",
  tenant_admin: "テナント管理者",
  team_leader: "チームリーダー",
  member: "メンバー",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: MeResponse) => {
        if (!d.role || !["super_admin", "tenant_admin", "reseller_admin", "team_leader"].includes(d.role)) {
          setDenied(true);
        } else {
          setMe(d);
        }
      })
      .catch(() => setDenied(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        読み込み中…
      </div>
    );
  }

  if (denied || !me) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="text-xs uppercase tracking-widest text-accent">Access Denied</div>
        <h1 className="mt-2 font-serif text-2xl font-semibold">このページへのアクセス権限がありません</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          管理画面はスーパー管理者・代理店管理者・テナント管理者のみ利用できます。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-sm border border-border px-5 py-2.5 text-sm font-medium hover:border-foreground/40"
        >
          ホームに戻る
        </Link>
      </div>
    );
  }

  const visibleNav = NAV_ITEMS.filter((n) => n.roles.includes(me.role ?? ""));

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-10">
        {/* Sidebar */}
        <aside className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-20">
            <div className="text-xs uppercase tracking-widest text-accent">Admin</div>
            <div className="mt-1 font-serif text-lg font-semibold">管理画面</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {ROLE_LABELS[me.role ?? ""] ?? me.role}
            </div>

            <nav className="mt-6 flex flex-col gap-0.5">
              {visibleNav.map((n) => {
                const active = pathname === n.to || (n.to !== "/admin" && pathname.startsWith(n.to));
                return (
                  <Link
                    key={n.to}
                    href={n.to}
                    className={`rounded-sm px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {n.label(me.role ?? "")}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-8 border-t border-border pt-4">
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
                ← 通常画面に戻る
              </Link>
            </div>
          </div>
        </aside>

        {/* Mobile nav */}
        <nav className="fixed inset-x-0 top-14 z-30 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur-md md:hidden">
          {visibleNav.map((n) => {
            const active = pathname === n.to || (n.to !== "/admin" && pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                href={n.to}
                className={`shrink-0 rounded-sm px-3 py-1.5 text-xs transition-colors ${
                  active ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {n.label(me.role ?? "")}
              </Link>
            );
          })}
        </nav>

        {/* Content */}
        <main className="min-w-0 flex-1 pt-10 md:pt-0">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}