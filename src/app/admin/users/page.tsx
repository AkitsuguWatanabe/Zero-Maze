"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RoleBadge } from "@/components/RoleBadge";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

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
  sessionTimeoutMinutes?: number;
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

const TEAM_ASSIGNABLE_ROLES = ["team_leader", "member"];
// super_adminはテナントに紐づかない（既存アカウントもtenant_id=null）ため、
// このロールを作成する場合はテナント指定を必須にしない
const TENANT_FREE_ROLES = ["super_admin"];

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
  const [newTenantId, setNewTenantId] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editTenantId, setEditTenantId] = useState("");
  const [editTeamId, setEditTeamId] = useState("");
  const [editSessionTimeout, setEditSessionTimeout] = useState("30");
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const isSuperOrReseller = ["super_admin", "reseller_admin"].includes(me?.role ?? "");
  const isTeamLeader = me?.role === "team_leader";
  // セッションタイムアウトの調整は当社（super_admin）のみ（13-4の方針）
  const isSuperAdmin = me?.role === "super_admin";

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
    if (me.role === "tenant_admin" || me.role === "team_leader") {
      fetch("/api/admin/teams")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setTeams(Array.isArray(d) ? d : []));
    } else if (me.role === "super_admin" && (selectedTenantId || newTenantId)) {
      fetch(`/api/admin/teams?tenantId=${selectedTenantId || newTenantId}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setTeams(Array.isArray(d) ? d : []));
    } else {
      setTeams([]);
    }
  }, [me, selectedTenantId, newTenantId]);

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
    : me?.role === "team_leader"
    ? ["member"]
    : ["tenant_admin", "team_leader", "member"];

  const canAssignTeam = teams.length > 0;

  async function addUser() {
    if (!newEmail.trim() || !newPassword) return;
    if (isSuperOrReseller && !TENANT_FREE_ROLES.includes(newRole) && !newTenantId) return;
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const endpoint = isSuperOrReseller ? "/api/admin/users" : "/api/users";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          loginId: newLoginId.trim(),
          password: newPassword,
          displayName: newDisplayName.trim(),
          role: newRole,
          teamId: TEAM_ASSIGNABLE_ROLES.includes(newRole) ? (newTeamId || null) : null,
          ...(isSuperOrReseller ? { tenantId: newTenantId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "作成に失敗しました");
      setSuccess(`${newEmail} のアカウントを作成しました`);
      setNewEmail(""); setNewLoginId(""); setNewPassword(""); setNewDisplayName(""); setNewRole("member"); setNewTeamId(""); setNewTenantId("");
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
    setEditSessionTimeout(String(u.sessionTimeoutMinutes ?? 30));
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
      if (isSuperAdmin && editTenantId) body.tenantId = editTenantId;
      // Always send teamId when the role can hold a team, so switching to "unassigned" is possible.
      if (TEAM_ASSIGNABLE_ROLES.includes(editRole)) {
        body.teamId = editTeamId || null;
      } else {
        body.teamId = null;
      }
      if (isSuperAdmin) {
        const minutes = Number(editSessionTimeout);
        if (Number.isInteger(minutes) && minutes >= 5 && minutes <= 480) {
          body.sessionTimeoutMinutes = minutes;
        }
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

  function startEditEmail(u: AdminUser) {
    setEditingEmailId(u.id);
    setEditEmailValue(u.email);
    setError(null);
    setSuccess(null);
  }

  async function saveEmailEdit(id: string) {
    if (!editEmailValue.trim()) return;
    setSavingEmail(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/users?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: editEmailValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error ?? "更新に失敗しました");
      setSuccess("メールアドレスを更新しました");
      setEditingEmailId(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setSavingEmail(false);
    }
  }

  async function deleteUser(id: string) {
    setDeleting(id);
    setError(null);
    try {
      const endpoint = isSuperOrReseller ? "/api/admin/users" : "/api/users";
      const res = await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
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

  // memberはナビにこの画面が表示されないが、URL直打ちでは到達できてしまっていた。
  // 他のadmin配下ページと同様にページ単位でも権限外なら表示自体をブロックする。
  if (me && !["super_admin", "reseller_admin", "tenant_admin", "team_leader"].includes(me.role ?? "")) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="text-xs uppercase tracking-widest text-accent">Access Denied</div>
        <h1 className="mt-2 font-serif text-2xl font-semibold">このページへのアクセス権限がありません</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          ユーザー管理はスーパー管理者・代理店管理者・テナント管理者・チームリーダーのみ利用できます。
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-sm border border-border px-5 py-2.5 text-sm font-medium hover:border-foreground/40">
          ホームに戻る
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Users"
          title={isTeamLeader ? "メンバー登録" : "ユーザー管理"}
          description={isTeamLeader ? "自チームのメンバーのログインアカウントを追加します。" : "ログインユーザーとロール・テナント・チーム割り当てを管理します。"}
        />
        <Button
          className="shrink-0"
          onClick={() => {
            if (isSuperOrReseller) setNewTenantId(selectedTenantId);
            setShowAddForm(true); setError(null); setSuccess(null);
          }}
        >
          + ユーザーを追加
        </Button>
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
        <div className="mt-4 rounded-sm border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          ✓ {success}
        </div>
      )}

      {showAddForm && (
        <div className="mt-5 rounded-sm border border-border bg-card p-5 shadow-paper">
          <h3 className="font-serif text-base font-semibold mb-4">新しいユーザーを追加</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {isSuperOrReseller && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  テナント{TENANT_FREE_ROLES.includes(newRole) ? "（任意）" : " *"}
                </label>
                <select
                  value={newTenantId}
                  onChange={(e) => setNewTenantId(e.target.value)}
                  className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
                >
                  <option value="">選択してください</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground">表示名（任意）</label>
              <Input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="田中 太郎"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">メールアドレス *</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@company.com"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">ログインID * <span className="text-muted-foreground/60">（英数字のみ）</span></label>
              <Input
                type="text"
                value={newLoginId}
                onChange={(e) => setNewLoginId(e.target.value)}
                placeholder="tanaka2"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">初期パスワード * <span className="text-muted-foreground/60">（8文字以上）</span></label>              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1"
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
{TEAM_ASSIGNABLE_ROLES.includes(newRole) && canAssignTeam && !isTeamLeader && (
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
            <Button
              onClick={addUser}
              disabled={adding || !newEmail.trim() || !newLoginId.trim() || !newPassword || (isSuperOrReseller && !TENANT_FREE_ROLES.includes(newRole) && !newTenantId)}
            >
              {adding ? "追加中…" : "追加する"}
            </Button>
            <Button variant="outline" onClick={() => setShowAddForm(false)}>
              キャンセル
            </Button>
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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>表示名</TableHead>
                  <TableHead>メールアドレス</TableHead>
                  <TableHead>ロール</TableHead>
                  {isSuperOrReseller && (
                    <TableHead className="hidden lg:table-cell">テナント</TableHead>
                  )}
                  <TableHead className="hidden lg:table-cell">チーム</TableHead>
                  {isSuperAdmin && (
                    <TableHead className="hidden lg:table-cell">セッションタイムアウト</TableHead>
                  )}
                  <TableHead className="hidden md:table-cell">最終ログイン</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const isEditing = editingId === u.id;
                  const isConfirmingDelete = confirmDeleteId === u.id;
                  const isSelf = u.id === me?.id;
                  return (
                    <TableRow key={u.id} className={isEditing ? "bg-muted/30" : "hover:bg-muted/20"}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {u.displayName}
                          {isSelf && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">自分</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {editingEmailId === u.id ? (
                          <input
                            type="email"
                            value={editEmailValue}
                            onChange={(e) => setEditEmailValue(e.target.value)}
                            className="rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                          />
                        ) : (
                          u.email
                        )}
                      </TableCell>
                      <TableCell>
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
                          <RoleBadge role={u.role} label={ROLE_LABELS[u.role] ?? u.role} />
                        )}
                      </TableCell>
                      {isSuperOrReseller && (
                        <TableCell className="text-muted-foreground hidden lg:table-cell">
                          {isEditing && isSuperAdmin ? (
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
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
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
                      </TableCell>
                      {isSuperAdmin && (
                        <TableCell className="text-muted-foreground hidden lg:table-cell">
                          {isEditing ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min={5}
                                max={480}
                                value={editSessionTimeout}
                                onChange={(e) => setEditSessionTimeout(e.target.value)}
                                className="w-16 rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                              />
                              <span className="text-xs">分</span>
                            </span>
                          ) : (
                            `${u.sessionTimeoutMinutes ?? 30}分`
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <span className="inline-flex items-center gap-2">
                            <Button size="sm" onClick={() => saveEdit(u.id)} disabled={saving}>
                              {saving ? "保存中…" : "保存"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                              キャンセル
                            </Button>
                          </span>
                        ) : isConfirmingDelete ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-destructive">本当に削除しますか？</span>
                            <Button size="sm" variant="destructive" onClick={() => deleteUser(u.id)} disabled={deleting === u.id}>
                              {deleting === u.id ? "削除中…" : "削除"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                              キャンセル
                            </Button>
                          </span>
                        ) : isTeamLeader ? (
                          editingEmailId === u.id ? (
                            <span className="inline-flex items-center gap-2">
                              <Button size="sm" onClick={() => saveEmailEdit(u.id)} disabled={savingEmail}>
                                {savingEmail ? "保存中…" : "保存"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingEmailId(null)}>
                                キャンセル
                              </Button>
                            </span>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => startEditEmail(u)}>
                              メール変更
                            </Button>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => startEdit(u)}>
                              編集
                            </Button>
                            {!isSelf && (
                              <Button size="sm" variant="outline"
                                className="hover:border-destructive hover:text-destructive"
                                onClick={() => setConfirmDeleteId(u.id)}>
                                削除
                              </Button>
                            )}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}