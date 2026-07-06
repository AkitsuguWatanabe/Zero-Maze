"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/lib/team-context";

type MeResponse = { role?: string };
type Team = { id: string; name: string };
type ProgressItem = {
  id: string;
  what: string;
  createdAt: string;
  daysElapsed: number;
  assigneeName: string;
  teamName: string | null;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ProgressDashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedTeamId } = useTeam();

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d: MeResponse) => setMe(d));
  }, []);

  // tenant_adminのみヘッダーのチーム選択で絞り込み可能。表示名の解決に使う。
  useEffect(() => {
    if (me?.role !== "tenant_admin") return;
    fetch("/api/admin/teams")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTeams(Array.isArray(d) ? d : []));
  }, [me]);

  useEffect(() => {
    if (!me) return;
    setLoading(true);
    setError(null);
    const url =
      me.role === "tenant_admin" && selectedTeamId
        ? `/api/admin/instructions?teamId=${selectedTeamId}`
        : "/api/admin/instructions";

    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || "取得に失敗しました");
        }
        return r.json();
      })
      .then((d: ProgressItem[]) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => setError(e instanceof Error ? e.message : "取得に失敗しました"))
      .finally(() => setLoading(false));
  }, [me, selectedTeamId]);

  if (!me) return null;

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-accent">Progress</div>
      <h1 className="mt-2 font-serif text-3xl font-semibold">進捗一覧</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        GO確定済みの指示を、送信からの経過日数とあわせて一覧表示します。
        {me.role === "tenant_admin" && selectedTeamId && (
          <>（表示中: {teamName(selectedTeamId)}）</>
        )}
      </p>

      {loading ? (
        <div className="mt-12 text-sm text-muted-foreground">読み込み中…</div>
      ) : error ? (
        <div className="mt-8 rounded-sm border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-12 rounded-sm border border-border bg-muted/40 px-5 py-8 text-center text-sm text-muted-foreground">
          該当する指示がまだありません。
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-sm border border-border bg-card shadow-paper">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">送信日</th>
                <th className="px-4 py-3 font-medium">経過日数</th>
                <th className="px-4 py-3 font-medium">担当者</th>
                <th className="px-4 py-3 font-medium">チーム</th>
                <th className="px-4 py-3 font-medium">指示概要</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDate(it.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={
                        it.daysElapsed >= 3
                          ? "rounded-sm bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                          : "text-muted-foreground"
                      }
                    >
                      {it.daysElapsed === 0 ? "本日" : `${it.daysElapsed}日`}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{it.assigneeName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {it.teamName ?? "—"}
                  </td>
                  <td className="max-w-md truncate px-4 py-3 text-muted-foreground" title={it.what}>
                    {it.what}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-sm border border-border bg-muted/40 px-5 py-4 text-xs text-muted-foreground">
        簡易版：完了・未着手のステータス管理は含みません（担当者機能の構築とあわせて本格版で対応予定）。
      </div>
    </div>
  );
}