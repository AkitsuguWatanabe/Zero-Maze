"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/lib/team-context";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type MeResponse = { role?: string };
type Team = { id: string; name: string };
type Tenant = { id: string; name: string };
type ProgressItem = {
  id: string;
  what: string;
  createdAt: string;
  daysElapsed: number;
  assigneeName: string;
  teamName: string | null;
  tenantName: string | null;
  feedbackStatus: "ok" | "unclear" | null;
  feedbackComment: string | null;
};

function FeedbackBadge({ status, comment }: { status: "ok" | "unclear" | null; comment: string | null }) {
  if (status === "ok") {
    return <span className="rounded-sm bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">承知しました</span>;
  }
  if (status === "unclear") {
    return (
      <span
        className="rounded-sm bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800"
        title={comment ?? undefined}
      >
        確認させてください{comment ? "・コメントあり" : ""}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">未回答</span>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ProgressDashboardPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedTeamId } = useTeam();

  const isCrossTenant = me?.role === "super_admin" || me?.role === "reseller_admin";

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

  // super_admin/reseller_adminはテナントを横断表示するため、絞り込み用の一覧を取得（19-3）。
  useEffect(() => {
    if (!isCrossTenant) return;
    fetch("/api/admin/tenants")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTenants(Array.isArray(d) ? d : []));
  }, [isCrossTenant]);

  useEffect(() => {
    if (!me) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (me.role === "tenant_admin" && selectedTeamId) params.set("teamId", selectedTeamId);
    if (isCrossTenant && selectedTenantId) params.set("tenantId", selectedTenantId);
    const qs = params.toString();
    const url = qs ? `/api/admin/instructions?${qs}` : "/api/admin/instructions";

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
  }, [me, selectedTeamId, isCrossTenant, selectedTenantId]);

  if (!me) return null;

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";
  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? "";

  return (
    <div>
      <PageHeader
        eyebrow="Progress"
        title="進捗一覧"
        description={
          <>
            GO確定済みの指示を、送信からの経過日数とあわせて一覧表示します。
            {me.role === "tenant_admin" && selectedTeamId && (
              <>（表示中: {teamName(selectedTeamId)}）</>
            )}
            {isCrossTenant && selectedTenantId && (
              <>（表示中: {tenantName(selectedTenantId)}）</>
            )}
          </>
        }
      />

      {isCrossTenant && tenants.length > 0 && (
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>送信日</TableHead>
                <TableHead>経過日数</TableHead>
                <TableHead>担当者</TableHead>
                {isCrossTenant && <TableHead>テナント</TableHead>}
                <TableHead>チーム</TableHead>
                <TableHead>フィードバック</TableHead>
                <TableHead>指示概要</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(it.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span
                      className={
                        it.daysElapsed >= 3
                          ? "rounded-sm bg-amber-100 px-2 py-0.5 font-medium text-amber-800"
                          : "text-muted-foreground"
                      }
                    >
                      {it.daysElapsed === 0 ? "本日" : `${it.daysElapsed}日`}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{it.assigneeName}</TableCell>
                  {isCrossTenant && (
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {it.tenantName ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {it.teamName ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <FeedbackBadge status={it.feedbackStatus} comment={it.feedbackComment} />
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground" title={it.what}>
                    {it.what}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="mt-6 rounded-sm border border-border bg-muted/40 px-5 py-4 text-xs text-muted-foreground">
        簡易版：完了・未着手のステータス管理は含みません（担当者機能の構築とあわせて本格版で対応予定）。
      </div>
    </div>
  );
}