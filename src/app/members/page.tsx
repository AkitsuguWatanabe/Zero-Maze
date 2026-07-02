"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SiteFooter } from "@/components/SiteHeader";
import { useTeam } from "@/lib/team-context";
import {
  BUSINESS_CATEGORIES,
  RANK_LABELS,
  type AssigneeRank,
  type BusinessCategory,
  type MemberProfile,
  type CategoryRanks,
} from "@/lib/mock-data";

type MemberProfileWithTeam = MemberProfile & { teamId?: string | null };
type Team = { id: string; name: string };

const RANKS: AssigneeRank[] = ["A", "B", "C", "D"];

const RANK_COLORS: Record<AssigneeRank, string> = {
  A: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  B: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  C: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  D: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const HINTS: Record<string, string> = {
  "1-1": "対象の「ヌケ・モレ」に気づけるか？",
  "1-2": "相手の本意（隠れたニーズ）を汲み取れるか？",
  "2-1": "事実から「根拠ある結論」を導き出せるか？",
  "2-2": "実行可能な「最短ルート」を描けるか？",
  "3-1": "誰が読んでも「一目でわかる状態」にできるか？",
  "3-2": "形式を遵守し、正確に継続記録できるか？",
  "4-1": "周囲を動かし、合意を形成できるか？",
  "4-2": "決められた手順を速く、正確にこなせるか？",
};

function RankBadge({ rank }: { rank: AssigneeRank }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-mono font-bold ${RANK_COLORS[rank]}`}>
      {rank}
    </span>
  );
}

function RankCell({ rank, onChange }: { rank: AssigneeRank | undefined; onChange: (r: AssigneeRank | undefined) => void }) {
  return (
    <div className="flex gap-1">
      {RANKS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(rank === r ? undefined : r)}
          title={RANK_LABELS[r].description}
          className={`rounded px-2 py-0.5 text-xs font-mono font-bold transition-colors ${
            rank === r ? RANK_COLORS[r] : "border border-border bg-background text-muted-foreground hover:border-foreground/40"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

const SUB_LABELS: Record<string, string> = {
  "1-1": "調査・実態確認", "1-2": "ヒアリング・聴取",
  "2-1": "分析・考察",     "2-2": "企画・計画立案",
  "3-1": "整理・構造化",   "3-2": "定型報告・可視化",
  "4-1": "対人交渉・調整", "4-2": "技能操作・実務遂行",
};

// Short major category labels for the summary strip
const MAJOR_SHORT: Record<string, string> = {
  "1": "情報", "2": "判断", "3": "記録", "4": "実行",
};

function ProfileSummary({ profile }: { profile: CategoryRanks }) {
  return (
    <div className="flex items-center gap-3">
      {BUSINESS_CATEGORIES.map((cat, ci) => (
        <div key={cat.major} className="flex items-center gap-1">
          {/* Divider between groups */}
          {ci > 0 && <span className="mr-2 h-5 w-px bg-border" />}
          {/* Major category short label */}
          <span className="text-[10px] font-medium text-muted-foreground/60 mr-1">
            {MAJOR_SHORT[cat.major]}
          </span>
          {/* Two sub-category rank badges */}
          {cat.subs.map((sub) => {
            const rank = profile[sub.sub as keyof CategoryRanks];
            return (
              <span
                key={sub.sub}
                title={`${sub.sub} ${SUB_LABELS[sub.sub]}${rank ? `: ${rank}ランク` : ": 未設定"}`}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-sm text-xs font-mono font-bold ${
                  rank ? RANK_COLORS[rank] : "border border-border/50 text-muted-foreground/30"
                }`}
              >
                {rank ?? "—"}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function MembersPage() {
  const { selectedTeamId } = useTeam();
  const [members, setMembers] = useState<MemberProfileWithTeam[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProfile, setEditProfile] = useState<CategoryRanks>({});
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editTeamId, setEditTeamId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { id?: string; isAdmin?: boolean; role?: string }) => {
        setIsAdmin(d.isAdmin !== false);
        setCurrentUserId(d.id ?? null);
        setRole(d.role ?? null);
      })
      .catch(() => setIsAdmin(true));
  }, []);

  // Team list — only tenant_admin manages multiple teams and needs the picker in each row.
  useEffect(() => {
    if (role !== "tenant_admin") { setTeams([]); return; }
    fetch("/api/admin/teams")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTeams(Array.isArray(d) ? d : []))
      .catch(() => setTeams([]));
  }, [role]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedTeamId ? `/api/members?teamId=${selectedTeamId}` : "/api/members";
      const res = await fetch(url);
      const data = await res.json() as MemberProfileWithTeam[];
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      setError("メンバーの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [selectedTeamId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const teamName = (id: string | null | undefined) =>
    id ? teams.find((t) => t.id === id)?.name ?? "—" : "未割り当て";

  function startEdit(m: MemberProfileWithTeam) {
    setEditingId(m.id);
    setExpandedId(m.id); // auto-expand when editing
    setEditProfile({ ...m.profile });
    setEditName(m.name);
    setEditEmail(m.email ?? "");
    setEditTeamId(m.teamId ?? "");
  }

  async function saveEdit(id: string) {
    setSaving(id);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: editName,
          email: editEmail || undefined,
          profile: editProfile,
          teamId: editTeamId || null,
        }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      await fetchMembers();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(null);
    }
  }

  async function deleteMember(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/members?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("削除に失敗しました");
      setMembers((prev) => prev.filter((m) => m.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  }

  // CSV format: name,email,1-1,1-2,2-1,2-2,3-1,3-2,4-1,4-2
  // Ranks: A/B/C/D or empty. Overwrites existing member if name matches.
  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
      const SUB_KEYS: BusinessCategory["sub"][] = ["1-1","1-2","2-1","2-2","3-1","3-2","4-1","4-2"];
      let imported = 0;
      for (const line of lines) {
        const cols = line.split(",").map((c) => c.trim());
        const name = cols[0];
        if (!name) continue;
        const email = cols[1] || undefined;
        const profile: CategoryRanks = {};
        SUB_KEYS.forEach((sub, i) => {
          const val = cols[i + 2]?.toUpperCase();
          if (val === "A" || val === "B" || val === "C" || val === "D") {
            profile[sub] = val as AssigneeRank;
          }
        });
        await fetch("/api/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, profile, teamId: selectedTeamId || null }),
        });
        imported++;
      }
      await fetchMembers();
      setError(null);
      alert(`${imported}件のプロファイルをインポートしました。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "インポートに失敗しました");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function addMember() {
    if (!newName.trim()) return;
    setSaving("new");
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), email: newEmail || undefined, profile: {}, teamId: selectedTeamId || null }),
      });
      if (!res.ok) throw new Error("追加に失敗しました");
      const added = await res.json() as MemberProfileWithTeam;
      await fetchMembers();
      setShowAddForm(false);
      setNewName("");
      setNewEmail("");
      setExpandedId(added.id); // auto-expand new member to fill in profile
    } catch (err) {
      setError(err instanceof Error ? err.message : "追加に失敗しました");
    } finally {
      setSaving(null);
    }
  }return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent">Members</div>
            <h1 className="mt-2 font-serif text-3xl font-semibold">メンバープロファイル管理</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              業務カテゴリ別に習熟度ランク（A〜D）を設定します。指示作成時にランクが自動提案されます。
              {selectedTeamId && teams.length > 0 && (
                <span className="ml-2 font-medium text-foreground">
                  （表示中: {teamName(selectedTeamId)}）
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {/* CSV import */}
            <label className={`cursor-pointer rounded-sm border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted ${importing ? "opacity-50 cursor-not-allowed" : ""}`}>
              {importing ? "インポート中…" : "CSVインポート"}
              <input ref={importRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleImportCSV} disabled={importing} />
            </label>
            <button
              onClick={() => { setShowAddForm(true); setError(null); }}
              className="rounded-sm bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
            >
              + メンバーを追加
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-sm border border-border bg-muted/40 px-5 py-3 text-sm text-muted-foreground">
          ※ ランクは「このメンバーに対してどの程度詳細な指示が必要か」という<strong className="text-foreground">指示コストの目安</strong>です。人事評価とは無関係です。
        </div>
        {/* CSV format hint */}
        <p className="mt-2 text-[10px] text-muted-foreground">
          CSVフォーマット（1行目から）: 名前, メール, 1-1, 1-2, 2-1, 2-2, 3-1, 3-2, 4-1, 4-2 — ランクはA/B/C/D（空欄可）。同名メンバーは上書きされます。
        </p>

        {error && (
          <div className="mt-4 rounded-sm border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs underline">閉じる</button>
          </div>
        )}

        {/* Add member form */}
        {showAddForm && (
          <div className="mt-5 rounded-sm border border-border bg-card p-5 shadow-paper">
            <h3 className="font-serif text-base font-semibold mb-4">新しいメンバーを追加</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs font-medium text-muted-foreground">名前 *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMember()}
                  placeholder="田中 太郎"
                  autoFocus
                  className="mt-1 block rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">メール（任意）</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="example@company.com"
                  className="mt-1 block rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
                />
              </div>
              {selectedTeamId && teams.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  追加先チーム: <span className="font-medium text-foreground">{teamName(selectedTeamId)}</span>
                </div>
              )}
              <button onClick={addMember} disabled={!newName.trim() || saving === "new"}
                className="rounded-sm bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40">
                {saving === "new" ? "追加中…" : "追加"}
              </button>
              <button onClick={() => setShowAddForm(false)}
                className="rounded-sm border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Rank legend */}
        <div className="mt-5 flex flex-wrap gap-2">
          {RANKS.map((r) => (
            <div key={r} className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${RANK_COLORS[r]}`}>
              <span className="font-mono font-bold">{r}</span>
              <span>{RANK_LABELS[r].short}</span>
            </div>
          ))}
        </div>

        {/* Member list */}
        {loading ? (
          <div className="mt-12 flex justify-center text-sm text-muted-foreground">読み込み中…</div>
        ) : members.length === 0 ? (
          <div className="mt-8 rounded-sm border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">まだメンバーが登録されていません。</p>
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            {members.map((m) => {
              const isExpanded = expandedId === m.id;
              const isEditing = editingId === m.id;
              const isConfirmingDelete = confirmDeleteId === m.id;

              return (
                <div key={m.id} className="rounded-sm border border-border bg-card shadow-paper">
                  {/* Collapsed header row — always visible */}
                  <div className="flex items-center gap-3 px-5 py-3">
                    {/* Expand toggle */}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : m.id)}
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

                    {/* Name + email */}
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input value={editName} onChange={(e) => setEditName(e.target.value)}
                            className="rounded-sm border border-border bg-background px-3 py-1 text-sm font-medium focus:border-foreground focus:outline-none" />
                          <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="メール（任意）"
                            className="rounded-sm border border-border bg-background px-3 py-1 text-xs text-muted-foreground focus:border-foreground focus:outline-none" />
                          {teams.length > 0 && (
                            <select
                              value={editTeamId}
                              onChange={(e) => setEditTeamId(e.target.value)}
                              className="rounded-sm border border-border bg-background px-2 py-1 text-xs text-muted-foreground focus:border-foreground focus:outline-none"
                            >
                              <option value="">未割り当て</option>
                              {teams.map((t) => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{m.name}</span>
                          {m.email && <span className="text-xs text-muted-foreground">{m.email}</span>}
                          {teams.length > 0 && (
                            <span className="text-[10px] text-muted-foreground/70">{teamName(m.teamId)}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Profile summary (hidden while editing or expanded) */}
                    {!isEditing && !isExpanded && (
                      <div className="hidden lg:block shrink-0">
                        <ProfileSummary profile={m.profile} />
                      </div>
                    )}

                    {/* Action buttons — all logged-in users can manage their own members */}
                    <div className="shrink-0 flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(m.id)} disabled={saving === m.id}
                            className="rounded-sm bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40">
                            {saving === m.id ? "保存中…" : "保存"}
                          </button>
                          <button onClick={() => { setEditingId(null); setExpandedId(null); }}
                            className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                            キャンセル
                          </button>
                        </>
                      ) : isConfirmingDelete ? (
                        <>
                          <span className="text-xs text-destructive">本当に削除しますか？</span>
                          <button onClick={() => deleteMember(m.id)} disabled={deleting === m.id}
                            className="rounded-sm bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
                            {deleting === m.id ? "削除中…" : "削除する"}
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)}
                            className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { startEdit(m); }}
                            className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                            編集
                          </button>
                          <button onClick={() => setConfirmDeleteId(m.id)}
                            className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive">
                            削除
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded profile table */}
                  {isExpanded && (
                    <div className="border-t border-border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground w-36">大分類</th>
                            <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">中分類</th>
                            <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden md:table-cell">ランク付けの視点</th>
                            <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground w-40">ランク</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {BUSINESS_CATEGORIES.map((cat) =>
                            cat.subs.map((sub, si) => {
                              const current = isEditing ? editProfile[sub.sub] : m.profile[sub.sub];
                              return (
                                <tr key={sub.sub} className="hover:bg-muted/20">
                                  {si === 0 && (
                                    <td rowSpan={cat.subs.length}
                                      className="border-r border-border px-4 py-2.5 align-middle text-sm font-medium text-foreground">
                                      {cat.major}. {cat.label}
                                    </td>
                                  )}
                                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{sub.sub}. {sub.label}</td>
                                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{HINTS[sub.sub]}</td>
                                  <td className="px-4 py-2.5">
                                    {isEditing ? (
                                      <RankCell
                                        rank={editProfile[sub.sub]}
                                        onChange={(r) => setEditProfile((prev) => {
                                          const next = { ...prev };
                                          if (r === undefined) delete next[sub.sub];
                                          else next[sub.sub] = r;
                                          return next;
                                        })}
                                      />
                                    ) : current ? (
                                      <RankBadge rank={current} />
                                    ) : (
                                      <span className="text-xs text-muted-foreground/40">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* User account management — admin only */}
        {isAdmin && <UserManagement currentUserId={currentUserId} />}
      </div>
      <SiteFooter />
    </div>
  );
}
// ─── User account management (admin-only section) ─────────────────────────
type AuthUser = { id: string; email: string; displayName: string; createdAt: string; lastSignIn?: string };

function UserManagement({ currentUserId }: { currentUserId: string | null }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json() as AuthUser[];
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setError("ユーザー一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function addUser() {
    if (!newEmail.trim() || !newPassword) return;
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), password: newPassword, displayName: newDisplayName.trim() }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "作成に失敗しました");
      setSuccess(`${newEmail} のアカウントを作成しました`);
      setNewEmail(""); setNewPassword(""); setNewDisplayName("");
      setShowAddForm(false);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(u: AuthUser) {
    setEditingId(u.id);
    setEditDisplayName(u.displayName);
    setEditEmail(u.email);
    setEditPassword("");
    setError(null);
    setSuccess(null);
    setConfirmDeleteId(null);
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, string> = {};
      const original = users.find((u) => u.id === id);
      if (editDisplayName.trim() !== original?.displayName) body.displayName = editDisplayName.trim();
      if (editEmail.trim() !== original?.email)             body.email = editEmail.trim();
      if (editPassword)                                     body.password = editPassword;

      if (Object.keys(body).length === 0) { setEditingId(null); return; }

      const res = await fetch(`/api/users?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "更新に失敗しました");
      setSuccess("アカウントを更新しました");
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
      const data = await res.json() as { success?: boolean; error?: string };
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
    <div className="mt-16 border-t border-border pt-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent">User Accounts</div>
          <h2 className="mt-2 font-serif text-2xl font-semibold">ログインユーザー管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">システムにログインできるアカウントを管理します。</p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setError(null); setSuccess(null); }}
          className="shrink-0 rounded-sm bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          + ユーザーを追加
        </button>
      </div>

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

      {/* Add user form */}
      {showAddForm && (
        <div className="mt-5 rounded-sm border border-border bg-card p-5 shadow-paper">
          <h3 className="font-serif text-base font-semibold mb-4">新しいユーザーを追加</h3>
          <div className="grid gap-3 sm:grid-cols-3">
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
              <label className="text-xs font-medium text-muted-foreground">初期パスワード * <span className="text-muted-foreground/60">（8文字以上）</span></label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={addUser}
              disabled={adding || !newEmail.trim() || !newPassword}
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

      {/* User list */}
      <div className="mt-5">
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
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden md:table-cell">{editingId ? "新しいパスワード" : "最終ログイン"}</th>
                  <th className="px-5 py-3 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground hidden md:table-cell">作成日</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => {
                  const isEditing = editingId === u.id;
                  const isConfirmingDelete = confirmDeleteId === u.id;
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className={isEditing ? "bg-muted/30" : "hover:bg-muted/20"}>
                      <td className="px-5 py-3 font-medium">
                        {isEditing ? (
                          <input
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                          />
                        ) : (
                          <span className="flex items-center gap-2">
                            {u.displayName}
                            {isSelf && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">自分</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {isEditing ? (
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                          />
                        ) : u.email}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">
                        {isEditing ? (
                          <input
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="新しいパスワード（変更する場合）"
                            className="w-full rounded-sm border border-border bg-background px-2 py-1 text-sm focus:border-foreground focus:outline-none"
                          />
                        ) : (
                          u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground hidden md:table-cell">
                        {new Date(u.createdAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
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