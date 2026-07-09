"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type MeResponse = { role?: string };

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
  const [me, setMe] = useState<MeResponse | null>(null);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d: MeResponse) => setMe(d));
  }, []);

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

  // reseller_adminはナビにこの画面が表示されないが、URL直打ちでは到達できてしまっていた
  // （APIはreseller_adminの変更操作を拒否するが、ページ自体は表示され操作ボタンが見えてしまう不具合）。
  if (me && me.role !== "super_admin") {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <div className="text-xs uppercase tracking-widest text-accent">Access Denied</div>
        <h1 className="mt-2 font-serif text-2xl font-semibold">このページへのアクセス権限がありません</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          代理店管理はスーパー管理者のみ利用できます。
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-sm border border-border px-5 py-2.5 text-sm font-medium hover:border-foreground/40">
          ホームに戻る
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          eyebrow="Resellers"
          title="代理店管理"
          description="Zero-Mazeを販売する代理店を管理します。代理店配下のテナントは代理店管理者が管理できます。"
        />
        <Button
          className="shrink-0"
          onClick={() => { setShowAddForm(true); setError(null); }}
        >
          + 代理店を追加
        </Button>
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
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addReseller()}
                placeholder="株式会社パートナー"
                autoFocus
                className="mt-1"
              />
            </div>
            <Button onClick={addReseller} disabled={!newName.trim() || saving === "new"}>
              {saving === "new" ? "追加中…" : "追加"}
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
        ) : resellers.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            代理店がありません
          </div>
        ) : (
          <div className="overflow-hidden rounded-sm border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead>代理店名</TableHead>
                  <TableHead>発行枠</TableHead>
                  <TableHead className="hidden md:table-cell">作成日</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {resellers.map((r) => {
                  const isEditing = editingId === r.id;
                  const isConfirmingDelete = confirmDeleteId === r.id;
                  return (
                    <TableRow key={r.id} className={isEditing ? "bg-muted/30" : "hover:bg-muted/20"}>
                      <TableCell className="font-medium">
                        {isEditing ? (
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                          />
                        ) : r.name}
                      </TableCell>
                      <TableCell>
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
                        <Button
                          size="sm" variant="outline" className="mt-1"
                          onClick={() => increaseQuota(r.id)}
                          disabled={saving === `quota-${r.id}`}
                        >
                          {saving === `quota-${r.id}` ? "処理中…" : "＋5 増枠"}
                        </Button>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {new Date(r.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <span className="inline-flex items-center gap-2">
                            <Button size="sm" onClick={() => saveEdit(r.id)} disabled={saving === r.id}>
                              {saving === r.id ? "保存中…" : "保存"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                              キャンセル
                            </Button>
                          </span>
                        ) : isConfirmingDelete ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-destructive">「{r.name}」を本当に削除しますか？</span>
                            <Button size="sm" variant="destructive" onClick={() => deleteReseller(r.id)} disabled={deleting === r.id}>
                              {deleting === r.id ? "削除中…" : "削除"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                              キャンセル
                            </Button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                              編集
                            </Button>
                            <Button size="sm" variant="outline"
                              className="hover:border-destructive hover:text-destructive"
                              onClick={() => setConfirmDeleteId(r.id)}>
                              削除
                            </Button>
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