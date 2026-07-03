"use client";

import { useCallback, useEffect, useState } from "react";

type MeResponse = { role?: string };
type Tenant = {
  id: string;
  name: string;
  slug: string | null;
  tenant_code?: string | null;
  reseller_id: string | null;
  status: string | null;
  frozen_at?: string | null;
  google_sheet_id: string | null;
  openai_model_normal: string | null;
  openai_model_important: string | null;
  created_at: string;
};
type Reseller = { id: string; name: string };

const STATUS_LABELS: Record<string, string> = {
  active: "稼働中",
  suspended: "停止中",
};

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "active";
  const isActive = s === "active";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        isActive
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      }`}
    >
      {STATUS_LABELS[s] ?? s}
    </span>
  );
}

export default function TenantsAdminPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newResellerId, setNewResellerId] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editSheetId, setEditSheetId] = useState("");
  const [editModelNormal, setEditModelNormal] = useState("");
  const [editModelImportant, setEditModelImportant] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

const isSuperAdmin = me?.role === "super_admin";
  const isReseller = me?.role === "reseller_admin";

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setMe);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, rRes] = await Promise.all([
        fetch("/api/admin/tenants"),
        fetch("/api/admin/resellers"),
      ]);
      const tData = tRes.ok ? await tRes.json() : [];
      const rData = rRes.ok ? await rRes.json() : [];
      setTenants(Array.isArray(tData) ? tData : []);
      setResellers(Array.isArray(rData) ? rData : []);
    } catch {
      setError("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resellerName = (id: string | null) =>
    id ? resellers.find((r) => r.id === id)?.name ?? "—" : "—";

  async function addTenant() {
    if (!newName.trim() || !newEmail.trim()) return;
    setSaving("new");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          resellerId: newResellerId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成に失敗しました");
      await fetchData();
      setShowAddForm(false);
      setNewName("");
      setNewEmail("");
      setNewResellerId("");
      if (data.tenant_code) {
        setNotice(
          `顧客企業を作成しました（企業ID: ${data.tenant_code}）。顧客管理者宛てに招待メールを${
            data.inviteSent ? "送信しました" : "送信できませんでした"
          }。`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSaving(null);
    }
  }

  function startEdit(t: Tenant) {
    setEditingId(t.id);
    setExpandedId(t.id);
    setEditName(t.name);
    setEditStatus(t.status ?? "active");
    setEditSheetId(t.google_sheet_id ?? "");
    setEditModelNormal(t.openai_model_normal ?? "");
    setEditModelImportant(t.openai_model_important ?? "");
  }

  async function saveEdit(id: string) {
    setSaving(id);
    setError(null);
    try {
      const body: Record<string, string> = { name: editName };
      if (isSuperAdmin) {
        body.status = editStatus;
        body.googleSheetId = editSheetId;
        body.openaiModelNormal = editModelNormal;
        body.openaiModelImportant = editModelImportant;
      }
      const res = await fetch(`/api/admin/tenants?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  async function deleteTenant(id: string) {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/tenants?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました");
      setTenants((prev) => prev.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent">
            {isReseller ? "Customers" : "Tenants"}
          </div>
          <h1 className="mt-2 font-serif text-3xl font-semibold">
            {isReseller ? "顧客企業管理" : "テナント管理"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isReseller
              ? "貴社が発行した顧客企業（テナント）を管理します。"
              : "Zero-Mazeを利用する企業（テナント）を管理します。"}
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setError(null); setNotice(null); }}
          className="shrink-0 rounded-sm bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          + {isReseller ? "顧客企業" : "テナント"}を追加
        </button>
      </div>

      {notice && (
        <div className="mt-4 flex items-center justify-between rounded-sm border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-xs underline">閉じる</button>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center justify-between rounded-sm border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline">閉じる</button>
        </div>
      )}

      {showAddForm && (
        <div className="mt-5 rounded-sm border border-border bg-card p-5 shadow-paper">
          <h3 className="font-serif text-base font-semibold mb-4">
            新しい{isReseller ? "顧客企業" : "テナント"}を追加
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {isReseller ? "顧客企業名" : "テナント名"} *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="株式会社サンプル"
                autoFocus
                className="mt-1 block rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                顧客管理者のメールアドレス *
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTenant()}
                placeholder="admin@example.com"
                className="mt-1 block rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
            {isSuperAdmin && resellers.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">代理店（任意）</label>
                <select
                  value={newResellerId}
                  onChange={(e) => setNewResellerId(e.target.value)}
                  className="mt-1 block rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
                >
                  <option value="">なし（直販）</option>
                  {resellers.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={addTenant}
              disabled={!newName.trim() || !newEmail.trim() || saving === "new"}
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
          <p className="mt-3 text-xs text-muted-foreground">
            企業IDは自動採番されます。入力されたメールアドレス宛てに、顧客管理者用の招待メールが送信されます。
          </p>
        </div>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">読み込み中…</div>
        ) : tenants.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {isReseller ? "顧客企業" : "テナント"}がありません
          </div>
        ) : (
          <div className="space-y-2">
            {tenants.map((t) => {
              const isExpanded = expandedId === t.id;
              const isEditing = editingId === t.id;
              const isConfirmingDelete = confirmDeleteId === t.id;
              return (
                <div key={t.id} className="rounded-sm border border-border bg-card shadow-paper">
                  <div className="flex items-center gap-3 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={isExpanded ? "折りたたむ" : "展開する"}
                    >
                      <svg
                        className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="rounded-sm border border-border bg-background px-3 py-1 text-sm font-medium focus:border-foreground focus:outline-none"
                        />
                      ) : (
                        <span className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{t.name}</span>
                          {t.tenant_code && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {t.tenant_code}
                            </span>
                          )}
                          {isSuperAdmin && <StatusBadge status={t.status} />}
                        </span>
                      )}
                    </div>

                    {isSuperAdmin && !isExpanded && (
                      <div className="hidden md:block shrink-0 text-xs text-muted-foreground">
                        {resellerName(t.reseller_id)}
                      </div>
                    )}

                    <div className="shrink-0 flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(t.id)} disabled={saving === t.id}
                            className="rounded-sm bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40">
                            {saving === t.id ? "保存中…" : "保存"}
                          </button>
                          <button onClick={() => { setEditingId(null); }}
                            className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                            キャンセル
                          </button>
                        </>
                      ) : isConfirmingDelete ? (
                        <>
                          <span className="text-xs text-destructive">本当に削除しますか？</span>
                          <button onClick={() => deleteTenant(t.id)} disabled={deleting === t.id}
                            className="rounded-sm bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
                            {deleting === t.id ? "削除中…" : "削除する"}
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(t)}
                            className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                            編集
                          </button>
                          {isSuperAdmin && (
                            <button onClick={() => setConfirmDeleteId(t.id)}
                              className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive">
                              削除
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border px-5 py-4">
                      <dl className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">代理店</dt>
                          <dd className="mt-1 text-sm">{resellerName(t.reseller_id)}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">作成日</dt>
                          <dd className="mt-1 text-sm">
                            {new Date(t.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
                          </dd>
                        </div>

                        {isSuperAdmin && (
                          <>
                            <div>
                              <dt className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">ステータス</dt>
                              <dd className="mt-1 text-sm">
                                {isEditing ? (
                                  <select
                                    value={editStatus}
                                    onChange={(e) => setEditStatus(e.target.value)}
                                    className="rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                                  >
                                    <option value="active">稼働中</option>
                                    <option value="suspended">停止中</option>
                                  </select>
                                ) : (
                                  <StatusBadge status={t.status} />
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Google Sheet ID</dt>
                              <dd className="mt-1 text-sm">
                                {isEditing ? (
                                  <input
                                    value={editSheetId}
                                    onChange={(e) => setEditSheetId(e.target.value)}
                                    placeholder="未設定"
                                    className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm font-mono focus:border-foreground focus:outline-none"
                                  />
                                ) : (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {t.google_sheet_id || "未設定"}
                                  </span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AIモデル（通常評価）</dt>
                              <dd className="mt-1 text-sm">
                                {isEditing ? (
                                  <input
                                    value={editModelNormal}
                                    onChange={(e) => setEditModelNormal(e.target.value)}
                                    placeholder="gpt-4.1-mini（デフォルト）"
                                    className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm font-mono focus:border-foreground focus:outline-none"
                                  />
                                ) : (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {t.openai_model_normal || "デフォルト（gpt-4.1-mini）"}
                                  </span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AIモデル（重要評価）</dt>
                              <dd className="mt-1 text-sm">
                                {isEditing ? (
                                  <input
                                    value={editModelImportant}
                                    onChange={(e) => setEditModelImportant(e.target.value)}
                                    placeholder="gpt-5.5（デフォルト）"
                                    className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm font-mono focus:border-foreground focus:outline-none"
                                  />
                                ) : (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {t.openai_model_important || "デフォルト（gpt-5.5）"}
                                  </span>
                                )}
                              </dd>
                            </div>
                          </>
                        )}
                      </dl>
                      {!isSuperAdmin && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          ステータス・Google Sheets・AIモデルの設定はスーパー管理者のみ変更できます。
                        </p>
                      )}
                      {isSuperAdmin && isExpanded && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          AIモデルを空欄にすると、システム全体のデフォルト（通常評価: gpt-4.1-mini／重要評価: gpt-5.5）が使用されます。このテナントの全ユーザーの評価・指示文生成に反映されます。
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}