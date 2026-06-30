"use client";

import { useCallback, useEffect, useState } from "react";

type MeResponse = { id?: string; role?: string; tenantId?: string | null };
type Tenant = { id: string; name: string };
type Team = {
  id: string;
  name: string;
  tenantId: string;
  createdAt: string;
};

type RawTeam = {
  id: string;
  name: string;
  tenant_id: string;
  created_at: string;
};

export default function AdminTeamsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTenantId, setNewTenantId] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const isSuperAdmin = me?.role === "super_admin";

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d: MeResponse) => setMe(d));
  }, []);

  // Load tenant list for the filter dropdown (super_admin only)
  useEffect(() => {
    if (!me || !isSuperAdmin) return;
    fetch("/api/admin/tenants")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTenants(Array.isArray(d) ? d : []));
  }, [me, isSuperAdmin]);

  const fetchTeams = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const url = isSuperAdmin
        ? `/api/admin/teams${selectedTenantId ? `?tenantId=${selectedTenantId}` : ""}`
        : "/api/admin/teams";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
      const raw = (Array.isArray(data) ? data : []) as RawTeam[];
      setTeams(
        raw.map((t) => ({
          id: t.id,
          name: t.name,
          tenantId: t.tenant_id,
          createdAt: t.created_at,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [me, isSuperAdmin, selectedTenantId]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? "—";

  async function addTeam() {
    if (!newName.trim()) return;
    if (isSuperAdmin && !newTenantId) {
      setError("テナントを選択してください");
      return;
    }
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          ...(isSuperAdmin ? { tenantId: newTenantId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました");
      setSuccess(`チーム「${newName.trim()}」を作成しました`);
      setNewName(""); setNewTenantId("");
      setShowAddForm(false);
      await fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(t: Team) {
    setEditingId(t.id);
    setEditName(t.name);
    setError(null);
    setSuccess(null);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/teams?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "更新に失敗しました");
      setSuccess("チーム名を更新しました");
      setEditingId(null);
      await fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam(id: string) {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teams?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "削除に失敗しました");
      setTeams((prev) => prev.filter((t) => t.id !== id));
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
          <div className="text-xs uppercase tracking-widest text-accent">Teams</div>
          <h1 className="mt-2 font-serif text-3xl font-semibold">チーム管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            チームを作成し、ユーザー管理画面からメンバーを割り当てます。
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setError(null); setSuccess(null); }}
          className="shrink-0 rounded-sm bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          + チームを追加
        </button>
      </div>

      {isSuperAdmin && tenants.length > 0 && (
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
          <h3 className="font-serif text-base font-semibold mb-4">新しいチームを追加</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">チーム名 *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="営業1課"
                className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
            {isSuperAdmin && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">テナント *</label>
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
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={addTeam}
              disabled={adding || !newName.trim()}
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
        ) : teams.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            チームがありません
          </div>
        ) : (
          <div className="overflow-hidden rounded-sm border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">チーム名</th>
                  {isSuperAdmin && (
                    <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden lg:table-cell">テナント</th>
                  )}
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden md:table-cell">作成日</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teams.map((t) => {
                  const isEditing = editingId === t.id;
                  const isConfirmingDelete = confirmDeleteId === t.id;
                  return (
                    <tr key={t.id} className={isEditing ? "bg-muted/30" : "hover:bg-muted/20"}>
                      <td className="px-5 py-3 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                          />
                        ) : (
                          t.name
                        )}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-5 py-3 text-muted-foreground hidden lg:table-cell">
                          {tenantName(t.tenantId)}
                        </td>
                      )}
                      <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">
                        {new Date(t.createdAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <span className="inline-flex items-center gap-2">
                            <button onClick={() => saveEdit(t.id)} disabled={saving}
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
                            <button onClick={() => deleteTeam(t.id)} disabled={deleting === t.id}
                              className="rounded-sm bg-destructive px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
                              {deleting === t.id ? "削除中…" : "削除"}
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)}
                              className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                              キャンセル
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <button onClick={() => startEdit(t)}
                              className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                              編集
                            </button>
                            <button onClick={() => setConfirmDeleteId(t.id)}
                              className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive">
                              削除
                            </button>
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