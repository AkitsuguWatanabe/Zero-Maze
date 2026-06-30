"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MeResponse = { role?: string; tenantId?: string | null; resellerId?: string | null };
type Tenant = { id: string; name: string; reseller_id: string | null; created_at: string };
type Reseller = { id: string; name: string; created_at: string };
type AdminUser = { id: string; role: string };

function StatCard({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <div className="rounded-sm border border-border bg-card p-5 shadow-paper transition-colors hover:border-foreground/30">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 font-serif text-3xl font-semibold">{value}</div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default function AdminDashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: MeResponse) => setMe(d));
  }, []);

  useEffect(() => {
    if (!me) return;
    setLoading(true);
    Promise.all([
      ["super_admin", "reseller_admin"].includes(me.role ?? "")
        ? fetch("/api/admin/tenants").then((r) => (r.ok ? r.json() : []))
        : Promise.resolve([]),
      me.role === "super_admin" ? fetch("/api/admin/resellers").then((r) => (r.ok ? r.json() : [])) : Promise.resolve([]),
      ["super_admin", "reseller_admin"].includes(me.role ?? "")
        ? fetch("/api/admin/users").then((r) => (r.ok ? r.json() : []))
        : fetch("/api/users").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([t, r, u]) => {
        setTenants(Array.isArray(t) ? t : []);
        setResellers(Array.isArray(r) ? r : []);
        setUsers(Array.isArray(u) ? u : []);
      })
      .finally(() => setLoading(false));
  }, [me]);

  if (!me) return null;

  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-accent">Dashboard</div>
      <h1 className="mt-2 font-serif text-3xl font-semibold">管理ダッシュボード</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Zero-Mazeの組織・ユーザー構成を管理します。
      </p>

      {loading ? (
        <div className="mt-12 text-sm text-muted-foreground">読み込み中…</div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {me.role === "super_admin" && (
            <StatCard label="代理店数" value={resellers.length} href="/admin/resellers" />
          )}
          {["super_admin", "reseller_admin"].includes(me.role ?? "") && (
            <StatCard label="テナント数" value={tenants.length} href="/admin/tenants" />
          )}
          <StatCard label="ユーザー数" value={users.length} href="/admin/users" />
        </div>
      )}

      <div className="mt-10 rounded-sm border border-border bg-muted/40 px-5 py-4 text-sm text-muted-foreground">
        {me.role === "super_admin" && (
          <p>スーパー管理者として、すべての代理店・テナント・ユーザーを管理できます。</p>
        )}
        {me.role === "reseller_admin" && (
          <p>代理店管理者として、自社の代理店配下のテナントを管理できます。</p>
        )}
        {me.role === "tenant_admin" && (
          <p>テナント管理者として、自社テナント内のユーザーを管理できます。</p>
        )}
      </div>
    </div>
  );
}