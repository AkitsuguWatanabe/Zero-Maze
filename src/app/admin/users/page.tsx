"use client";

import { useCallback, useEffect, useState } from "react";

type MeResponse = { id?: string; role?: string; tenantId?: string | null };
type Tenant = { id: string; name: string };
type Team = { id: string; name: string };
type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  tenantId: string | null;
  teamId: string | null;
  createdAt: string;
  lastSignIn?: string;
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "スーパー管理者",
  reseller_admin: "代理店管理者",
  tenant_admin: "テナント管理者",
  team_leader: "チームリーダー",
  member: "メンバー",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  reseller_admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  tenant_admin: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  team_leader: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  member: "bg-muted text-muted-foreground",
};

const TEAM_ASSIGNABLE_ROLES = ["team_leader", "member"];

export default function AdminUsersPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newLoginId, setNewLoginId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [newTeamId, setNewTeamId] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editTenantId, setEditTenantId] = useState("");
  const [editTeamId, setEditTeamId] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const isSuperOrReseller = ["super_admin", "reseller_admin"].includes(me?.role ?? "");

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d: MeResponse) => setMe(d));
  }, []);

  // Load tenant list for the filter dropdown (super_admin / reseller_admin only)
  useEffect(() => {
    if (!me || !isSuperOrReseller) return;
    fetch("/api/admin/tenants")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTenants(Array.isArray(d) ? d : []));
  }, [me, isSuperOrReseller]);

  // Load team list. tenant_admin: teams within their own tenant.
  // super_admin: teams within the currently filtered tenant (if any).
  // reseller_admin: team assignment isn't available (teams span a single tenant they don't directly manage here).
  useEffect(() => {
    if (!me) return;
    if (me.role === "tenant_admin") {
      fetch("/api/admin/teams")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setTeams(Array.isArray(d) ? d : []));
    } else if (me.role === "super_admin" && selectedTenantId) {
      fetch(`/api/admin/teams?tenantId=${selectedTenantId}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setTeams(Array.isArray(d) ? d : []));
    } else {
      setTeams([]);
    }
  }, [me, selectedTenantId]);

  const fetchUsers = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const url = isSuperOrReseller
        ? `/api/admin/users${selectedTenantId ? `?tenantId=${selectedTenantId}` : ""}`
        : "/api/users";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [me, isSuperOrReseller, selectedTenantId]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const tenantName = (id: string | null) =>
    id ? tenants.find((t) => t.id === id)?.name ?? "—" : "—";

  const teamName = (id: string | null) =>
    id ? teams.find((t) => t.id === id)?.name ?? "—" : "—";

  const allowedRoleOptions = me?.role === "super_admin"
    ? ["super_admin", "reseller_admin", "tenant_admin", "team_leader", "member"]
    : ["tenant_admin", "team_leader", "member"];

  const canAssignTeam = teams.length > 0;

  async function addUser() {
    if (!newEmail.trim() || !newPassword) return;
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          loginId: newLoginId.trim(),
          password: newPassword,
          displayName: newDisplayName.trim(),
          role: newRole,
          teamId: TEAM_ASSIGNABLE_ROLES.includes(newRole) ? (newTeamId || null) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "作成に失敗しました");
      setSuccess(`${newEmail} のアカウントを作成しました`);
      setNewEmail(""); setNewLoginId(""); setNewPassword(""); setNewDisplayName(""); setNewRole("member"); setNewTeamId("");
      setShowAddForm(false);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(u: AdminUser) {
    setEditingId(u.id);
    setEditRole(u.role);
    setEditTenantId(u.tenantId ?? "");
    setEditTeamId(u.teamId ?? "");
    setError(null);
    setSuccess(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {};
      if (editRole) body.role = editRole;
      if (editTenantId) body.tenantId = editTenantId;
      // Always send teamId when the role can hold a team, so switching to "unassigned" is possible.
      if (TEAM_ASSIGNABLE_ROLES.includes(editRole)) {
        body.teamId = editTeamId || null;
      } else {
        body.teamId = null;
      }

      const endpoint = isSuperOrReseller ? "/api/admin/users" : "/api/users";
      const res = await fetch(`${endpoint}?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || (data.success === false)) throw new Error(data.error ?? "更新に失敗しました");
      setSuccess("ユーザー情報を更新しました");
      setEditingId(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(id: string) {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "削除に失敗しました");
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent">Users</div>
          <h1 className="mt-2 font-serif text-3xl font-semibold">ユーザー管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ログインユーザーとロール・テナント・チーム割り当てを管理します。
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setError(null); setSuccess(null); }}
          className="shrink-0 rounded-sm bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          + ユーザーを追加
        </button>
      </div>

      {isSuperOrReseller && tenants.length > 0 && (
        <div className="mt-5 flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">テナントで絞り込み</label>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="rounded-sm border border-border bg-background px-3 py-1.5 text-sm focus:border-foreground focus:outline-none"
          >
            <option value="">すべて</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center justify-between rounded-sm border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline">閉じる</button>
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-sm border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400">
          ✓ {success}
        </div>
      )}

      {showAddForm && (
        <div className="mt-5 rounded-sm border border-border bg-card p-5 shadow-paper">
          <h3 className="font-serif text-base font-semibold mb-4">新しいユーザーを追加</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">表示名（任意）</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="田中 太郎"
                className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
new:
            <div>
              <label className="text-xs font-medium text-muted-foreground">メールアドレス *</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@company.com"
                className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">ログインID * <span className="text-muted-foreground/60">（英数字のみ）</span></label>
              <input
                type="text"
                value={newLoginId}
                onChange={(e) => setNewLoginId(e.target.value)}
                placeholder="tanaka2"
                className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">初期パスワード * <span className="text-muted-foreground/60">（8文字以上）</span></label>              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">ロール</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              >
                {allowedRoleOptions.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            {TEAM_ASSIGNABLE_ROLES.includes(newRole) && canAssignTeam && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">チーム（任意）</label>
                <select
                  value={newTeamId}
                  onChange={(e) => setNewTeamId(e.target.value)}
                  className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
                >
                  <option value="">未割り当て</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={addUser}
              disabled={adding || !newEmail.trim() || !newLoginId.trim() || !newPassword}
              className="rounded-sm bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              {adding ? "追加中…" : "追加する"}
            </button>
            <button onClick={() => setShowAddForm(false)} className="rounded-sm border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">読み込み中…</div>
        ) : users.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            ユーザーがいません
          </div>
        ) : (
          <div className="overflow-hidden rounded-sm border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">表示名</th>
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">メールアドレス</th>
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">ロール</th>
                  {isSuperOrReseller && (
                    <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden lg:table-cell">テナント</th>
                  )}
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden lg:table-cell">チーム</th>
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden md:table-cell">最終ログイン</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => {
                  const isEditing = editingId === u.id;
                  const isConfirmingDelete = confirmDeleteId === u.id;
                  const isSelf = u.id === me?.id;
                  return (
                    <tr key={u.id} className={isEditing ? "bg-muted/30" : "hover:bg-muted/20"}>
                      <td className="px-5 py-3 font-medium">
                        <span className="flex items-center gap-2">
                          {u.displayName}
                          {isSelf && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">自分</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                          >
                            {allowedRoleOptions.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-muted text-muted-foreground"}`}>
                            {ROLE_LABELS[u.role] ?? u.role}
                          </span>
                        )}
                      </td>
                      {isSuperOrReseller && (
                        <td className="px-5 py-3 text-muted-foreground hidden lg:table-cell">
                          {isEditing ? (
                            <select
                              value={editTenantId}
                              onChange={(e) => setEditTenantId(e.target.value)}
                              className="rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                            >
                              <option value="">変更しない</option>
                              {tenants.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          ) : tenantName(u.tenantId)}
                        </td>
                      )}
                      <td className="px-5 py-3 text-muted-foreground hidden lg:table-cell">
                        {isEditing ? (
                          TEAM_ASSIGNABLE_ROLES.includes(editRole) && canAssignTeam ? (
                            <select
                              value={editTeamId}
                              onChange={(e) => setEditTeamId(e.target.value)}
                              className="rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                            >
                              <option value="">未割り当て</option>
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs">—</span>
                          )
                        ) : (
                          teamName(u.teamId)
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">
                        {u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <span className="inline-flex items-center gap-2">
                            <button onClick={() => saveEdit(u.id)} disabled={saving}
                              className="rounded-sm bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40">
                              {saving ? "保存中…" : "保存"}
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                              キャンセル
                            </button>
                          </span>
                        ) : isConfirmingDelete ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-destructive">本当に削除しますか？</span>
                            <button onClick={() => deleteUser(u.id)} disabled={deleting === u.id}
                              className="rounded-sm bg-destructive px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
                              {deleting === u.id ? "削除中…" : "削除"}
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)}
                              className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                              キャンセル
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <button onClick={() => startEdit(u)}
                              className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                              編集
                            </button>
                            {!isSelf && (
                              <button onClick={() => setConfirmDeleteId(u.id)}
                                className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive">
                                削除
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}