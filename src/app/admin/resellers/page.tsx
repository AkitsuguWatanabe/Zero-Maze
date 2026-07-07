"use client";

import { useCallback, useEffect, useState } from "react";

type Reseller = {
  id: string;
  name: string;
  quota_limit: number;
  quota_used: number;
  tenant_count: number;
  frozen_count: number;
  created_at: string;
};

export default function ResellersAdminPage() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/resellers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
      setResellers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function addReseller() {
    if (!newName.trim()) return;
    setSaving("new");
    setError(null);
    try {
      const res = await fetch("/api/admin/resellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました");
      await fetchData();
      setShowAddForm(false);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSaving(null);
    }
  }

  function startEdit(r: Reseller) {
    setEditingId(r.id);
    setEditName(r.name);
  }

  async function saveEdit(id: string) {
    setSaving(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/resellers?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "更新に失敗しました");
      await fetchData();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setSaving(null);
    }
  }

  async function deleteReseller(id: string) {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/resellers?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました");
      setResellers((prev) => prev.filter((r) => r.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  }

  async function increaseQuota(id: string) {
    setSaving(`quota-${id}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/resellers?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaIncrement: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "増枠に失敗しました");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "増枠に失敗しました");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent">Resellers</div>
          <h1 className="mt-2 font-serif text-3xl font-semibold">代理店管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Zero-Mazeを販売する代理店を管理します。代理店配下のテナントは代理店管理者が管理できます。
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setError(null); }}
          className="shrink-0 rounded-sm bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          + 代理店を追加
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-center justify-between rounded-sm border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline">閉じる</button>
        </div>
      )}

      {showAddForm && (
        <div className="mt-5 rounded-sm border border-border bg-card p-5 shadow-paper">
          <h3 className="font-serif text-base font-semibold mb-4">新しい代理店を追加</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">代理店名 *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addReseller()}
                placeholder="株式会社パートナー"
                autoFocus
                className="mt-1 block rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
            <button
              onClick={addReseller}
              disabled={!newName.trim() || saving === "new"}
              className="rounded-sm bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              {saving === "new" ? "追加中…" : "追加"}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-sm border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">読み込み中…</div>
        ) : resellers.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            代理店がありません
          </div>
        ) : (
          <div className="overflow-hidden rounded-sm border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">代理店名</th>
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">発行枠</th>
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden md:table-cell">作成日</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resellers.map((r) => {
                  const isEditing = editingId === r.id;
                  const isConfirmingDelete = confirmDeleteId === r.id;
                  return (
                    <tr key={r.id} className={isEditing ? "bg-muted/30" : "hover:bg-muted/20"}>
                      <td className="px-5 py-3 font-medium">
                        {isEditing ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                          />
                        ) : r.name}
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-sm">
                          {r.quota_used} / {r.quota_limit}
                          <span className="ml-1 text-xs text-muted-foreground">
                            （残り{Math.max(0, r.quota_limit - r.quota_used)}）
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          テナント{r.tenant_count}件
                          {r.frozen_count > 0 && `（うち凍結${r.frozen_count}件）`}
                        </div>
                        <button
                          onClick={() => increaseQuota(r.id)}
                          disabled={saving === `quota-${r.id}`}
                          className="mt-1 rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40"
                        >
                          {saving === `quota-${r.id}` ? "処理中…" : "＋5 増枠"}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">
                        {new Date(r.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <span className="inline-flex items-center gap-2">
                            <button onClick={() => saveEdit(r.id)} disabled={saving === r.id}
                              className="rounded-sm bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40">
                              {saving === r.id ? "保存中…" : "保存"}
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                              キャンセル
                            </button>
                          </span>
                        ) : isConfirmingDelete ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-destructive">本当に削除しますか？</span>
                            <button onClick={() => deleteReseller(r.id)} disabled={deleting === r.id}
                              className="rounded-sm bg-destructive px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
                              {deleting === r.id ? "削除中…" : "削除"}
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)}
                              className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                              キャンセル
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <button onClick={() => startEdit(r)}
                              className="rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                              編集
                            </button>
                            <button onClick={() => setConfirmDeleteId(r.id)}
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