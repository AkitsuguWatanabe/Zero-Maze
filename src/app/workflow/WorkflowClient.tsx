"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClockIcon } from "lucide-react";
import { SiteFooter } from "@/components/SiteHeader";
import { useTeam } from "@/lib/team-context";
import { useAutosizeTextarea } from "@/hooks/useAutosizeTextarea";
import { ScoreBadge } from "@/components/ScoreBadge";
import { PageHeader } from "@/components/PageHeader";
import { Card as UiCard } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { detectPii, redactPii, PII_KIND_LABEL, type PiiMatch } from "@/lib/pii-guard";
import {
  PERSPECTIVES,
  SAMPLE_DRAFT,
  SCORE_LABELS,
  RANK_LABELS,
  RANK_THRESHOLDS,
  SUPPORT_MODE_LABELS,
  SUPPORT_MODE_DESC,
  IMPORTANCE_LABELS,
  BUSINESS_CATEGORIES,
  URGENCY_LABELS,
  TONE_LABELS,
  getMandatoryLabel,
  checkMandatory,
  mergeTeamCategories,
  COMPOSED_DRAFT_STORAGE_KEY,
  type AssigneeRank,
  type SupportMode,
  type ImportanceLevel,
  type UrgencyLevel,
  type ToneType,
  type BusinessCategory,
  type InstructionDraft,
  type ComposeDraft,
  type Evaluation,
  type MemberProfile,
  type TeamCategoryOverride,
  type InstructionTemplate,
} from "@/lib/mock-data";

type Categories = typeof BUSINESS_CATEGORIES;

type Step = 1 | 2 | 3 | 4;

// 16-1: 完了条件・成果物のテキストに「｜提出方法：」区切りが含まれる場合、
// 「成果物」と「提出・共有方法」を別々の行に分けて表示する（表示のみの変更。
// DB保存・Google Sheets出力・最終指示文の生成には影響しない）。
function renderCompletionDeliverable(text: string) {
  const marker = "｜提出方法：";
  const idx = text.indexOf(marker);
  if (idx === -1) {
    return <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{text}</p>;
  }
  const deliverable = text.slice(0, idx).trim();
  const delivery = text.slice(idx + marker.length).trim();
  return (
    <div className="space-y-2">
      <div>
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">成果物</div>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{deliverable}</p>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">提出・共有方法</div>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{delivery}</p>
      </div>
    </div>
  );
}

const EMPTY_DRAFT: InstructionDraft = {
  overview: "",
  deadline: "",
  estimated_hours: "",
  urgency: "medium",
  constraints: "",
  assignee_name: "",
  tone: "peer",
  assignee_rank: "B",
  support_mode: "efficiency",
  importance: "standard",
};

async function fetchEvaluation(draft: InstructionDraft, teamId: string | null, signal?: AbortSignal): Promise<Evaluation> {
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft, assignee_rank: draft.assignee_rank, support_mode: draft.support_mode, team_id: teamId || null }),
    signal,
  });
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error("評価がタイムアウトしました。もう一度お試しください。（評価精度を「通常」に切り替えると速くなります）");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `評価に失敗しました (${res.status})`);
  }
  return res.json() as Promise<Evaluation>;
}

async function fetchRegenerateText(draft: InstructionDraft): Promise<string> {
  const res = await fetch("/api/generate-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft, assignee_rank: draft.assignee_rank, support_mode: draft.support_mode }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as { error?: string }).error ?? "生成に失敗しました");
  }
  return ((await res.json()) as { final_instruction: string }).final_instruction;
}

const SESSION_KEY = "zeromaze_workflow";

type SessionData = {
  step: Step;
  maxStep: Step;
  draft: InstructionDraft;
  rawInput: string;
  initialRawInput?: string;
  evaluation: Evaluation | null;
  initialEvaluation?: Evaluation | null;
  businessCategory: BusinessCategory | null;
  finalText: string;
  manuallyEdited: boolean;
  evaluatedRank?: AssigneeRank | "";
  evaluatedMode?: SupportMode | "";
};

function saveSession(data: SessionData) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch (_) { /* storage unavailable */ }
}

function loadSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  } catch { return null; }
}

export default function WorkflowClient() {
  const { selectedTeamId } = useTeam();
  const [step, setStep] = useState<Step>(1);
  const [maxStep, setMaxStep] = useState<Step>(1);
  const [draft, setDraft] = useState<InstructionDraft>(EMPTY_DRAFT);
  const [rawInput, setRawInput] = useState("");
  // 20-8: 最初に評価した時点の指示概要（再評価で概要を書き換えても上書きしない）。
  // Sheets出力の「元の指示概要」列で、指示者が最初に何を書いたかを追跡できるようにする。
  const [initialRawInput, setInitialRawInput] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  // 19: 最初の評価結果（再評価しても上書きしない）。Sheets出力で「もとの評価値」として使う。
  const [initialEvaluation, setInitialEvaluation] = useState<Evaluation | null>(null);
  const [evaluatedRank, setEvaluatedRank] = useState<AssigneeRank | "">("");
  const [evaluatedMode, setEvaluatedMode] = useState<SupportMode | "">("");
  const [businessCategory, setBusinessCategory] = useState<BusinessCategory | null>(null);
  const [finalText, setFinalText] = useState("");
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const evalAbortRef = useRef<AbortController | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sheetsStatus, setSheetsStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sheetsUrl, setSheetsUrl] = useState<string | null>(null);
  const [sheetsShareWarning, setSheetsShareWarning] = useState<string | null>(null);
  const [showRegenDialog, setShowRegenDialog] = useState(false);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [templates, setTemplates] = useState<InstructionTemplate[]>([]);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Categories>(BUSINESS_CATEGORIES);

  // team_leaderは常に自チーム固定（ヘッダーのチーム切替はtenant_admin向けのため使わない）
  const effectiveTeamId = myRole === "team_leader" ? myTeamId : selectedTeamId;

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { role?: string; teamId?: string | null }) => {
        setMyRole(d.role ?? null);
        setMyTeamId(d.teamId ?? null);
      })
      .catch(() => {});
  }, []);

  // Effective category labels for the current team (falls back to the global default).
  useEffect(() => {
    if (!effectiveTeamId) { setCategories(BUSINESS_CATEGORIES); return; }
    fetch(`/api/team-categories?teamId=${effectiveTeamId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: TeamCategoryOverride[]) => setCategories(mergeTeamCategories(Array.isArray(d) ? d : [])))
      .catch(() => setCategories(BUSINESS_CATEGORIES));
  }, [effectiveTeamId]);

  // Restore session from sessionStorage after mount (SSR-safe)
  useEffect(() => {
    // A draft handed off from /workflow/compose takes priority over any
    // in-progress session — it's a fresh draft the user just finished
    // building, so we consume it and start over at step 1 rather than
    // resuming whatever was previously in progress.
    const composedRaw = sessionStorage.getItem(COMPOSED_DRAFT_STORAGE_KEY);
    if (composedRaw) {
      sessionStorage.removeItem(COMPOSED_DRAFT_STORAGE_KEY);
      try {
        const composed = JSON.parse(composedRaw) as ComposeDraft;
        setDraft({ ...EMPTY_DRAFT, ...composed });
        setStep(1);
        setMaxStep(1);
        setSessionRestored(true);
        return;
      } catch {
        // malformed payload — fall through to normal session restore below
      }
    }

    const saved = loadSession();
    if (saved) {
      setStep(saved.step);
      setMaxStep(saved.maxStep ?? saved.step);
      setDraft(saved.draft);
      setRawInput(saved.rawInput);
      setInitialRawInput(saved.initialRawInput ?? saved.rawInput);
      setEvaluation(saved.evaluation);
      setInitialEvaluation(saved.initialEvaluation ?? saved.evaluation);
      setEvaluatedRank(saved.evaluatedRank ?? "");
      setEvaluatedMode(saved.evaluatedMode ?? "");
      setBusinessCategory(saved.businessCategory);
      setFinalText(saved.finalText);
      setManuallyEdited(saved.manuallyEdited);
    }
    setSessionRestored(true);
  }, []);

  // Persist to sessionStorage whenever key state changes (after restore is done)
  useEffect(() => {
    if (!sessionRestored) return;
    saveSession({ step, maxStep, draft, rawInput, initialRawInput, evaluation, initialEvaluation, evaluatedRank, evaluatedMode, businessCategory, finalText, manuallyEdited });
  }, [step, maxStep, draft, rawInput, initialRawInput, evaluation, initialEvaluation, evaluatedRank, evaluatedMode, businessCategory, finalText, manuallyEdited, sessionRestored]);

  // Advance maxStep whenever step goes further
  useEffect(() => {
    if (step > maxStep) setMaxStep(step);
  }, [step, maxStep]);

  // Load member list for assignee picker — team switch narrows the candidates.
  useEffect(() => {
    const url = effectiveTeamId ? `/api/members?teamId=${effectiveTeamId}` : "/api/members";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setMembers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [effectiveTeamId]);

  // 16-6: this instructor's saved instruction templates (up to 3)
  const fetchTemplates = useCallback(() => {
    fetch("/api/instruction-templates")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: InstructionTemplate[]) => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  async function runEvaluation() {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    evalAbortRef.current = controller;
    try {
      setRawInput(draft.overview);
      setInitialRawInput((prev) => prev || draft.overview);
      const rankUsed = (draft.assignee_rank || "B") as AssigneeRank;
      const modeUsed = draft.support_mode;
      const result = await fetchEvaluation(draft, effectiveTeamId, controller.signal);
      setEvaluation(result);
      setInitialEvaluation((prev) => prev ?? result);
      setEvaluatedRank(rankUsed);
      setEvaluatedMode(modeUsed);
      setBusinessCategory(result.business_category);
      setFinalText(result.final_instruction);
      setManuallyEdited(false);
      setMaxStep(2); // reset max — new eval invalidates old preview/GO

      // Auto-fill optional draft fields from AI extraction if they were blank,
      // AND apply the profile rank for the detected sub-category
      const ext = result.structured_extraction;
      const MISSING = "（未記載）";
      const detectedSub = result.business_category?.sub;
      setDraft((prev) => {
        // Derive rank from assignee's profile for the detected sub-category
        const member = members.find(
          (m) => m.name === prev.assignee_name || m.email === prev.assignee_name,
        );
        const derivedRank: AssigneeRank | "" =
          detectedSub && member?.profile[detectedSub]
            ? (member.profile[detectedSub] as AssigneeRank)
            : prev.assignee_rank;

        return {
          ...prev,
          assignee_rank: derivedRank || "B",
          deadline:
            !prev.deadline && ext?.deadline_extracted && ext.deadline_extracted !== MISSING
              ? ext.deadline_extracted
              : prev.deadline,
          estimated_hours:
            !prev.estimated_hours && ext?.workload_extracted && ext.workload_extracted !== MISSING
              ? ext.workload_extracted
              : prev.estimated_hours,
          constraints:
            !prev.constraints && ext?.constraints_extracted && ext.constraints_extracted !== MISSING
              ? ext.constraints_extracted
              : prev.constraints,
        };
      });

      setStep(2);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("評価をキャンセルしました。");
      } else {
        setError(err instanceof Error ? err.message : "評価に失敗しました。再試行してください。");
      }
    } finally {
      evalAbortRef.current = null;
      setLoading(false);
    }
  }

  // When business category changes, auto-derive rank from member profile
  function applyProfileRank(cat: BusinessCategory | null) {
    if (!cat || !draft.assignee_name) return;
    const member = members.find(
      (m) => m.name === draft.assignee_name || m.email === draft.assignee_name,
    );
    if (member) {
      const subRank = member.profile[cat.sub];
      if (subRank) setDraft((prev) => ({ ...prev, assignee_rank: subRank }));
    }
  }

  function handleCategoryChange(cat: BusinessCategory) {
    setBusinessCategory(cat);
    applyProfileRank(cat);
  }

  function handleGo() {
    setStep(4);
    setSaveStatus("saving");
    const assignedMember = members.find(
      (m) => m.name === draft.assignee_name || m.email === draft.assignee_name,
    );
// 20-8: raw_input は再評価前の最初の入力文（initialRawInput）を保存する。
// CSVエクスポート（/api/export）の「元の指示概要」列がGoogle Sheets出力と
// 同じ意味（当初の指示）になるようにするため。
const body = JSON.stringify({ draft, evaluation: effectiveEvaluation, initialEvaluation, raw_input: initialRawInput || rawInput, final_text: finalText, business_category: businessCategory, team_id: effectiveTeamId || null, assignee_id: assignedMember?.id ?? null });
    // Save to Supabase
    fetch("/api/instructions", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then((r) => setSaveStatus(r.ok ? "saved" : "error"))
      .catch(() => setSaveStatus("error"));
    // Auto-export to Google Sheets — does not block the flow, but the UI reflects
    // whether it actually succeeded and links to the tenant's real sheet (20-7).
    setSheetsStatus("saving");
    fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Sheetsの「元の指示概要」は再評価前の最初の入力文を出す（20-8: 再評価で
      // 上書きされた最新の概要ではなく、指示者が最初に何を書いたかを追跡するため）。
      body: JSON.stringify({ draft, evaluation: effectiveEvaluation, initialEvaluation, rawInput: initialRawInput || rawInput, finalText }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.url) {
          setSheetsUrl(data.url);
          setSheetsStatus("saved");
          setSheetsShareWarning(data.sheetShareError ?? null);
        } else {
          setSheetsStatus("error");
        }
      })
      .catch(() => setSheetsStatus("error"));
  }

  async function handleRegenerate() {
    if (manuallyEdited) { setShowRegenDialog(true); return; }
    await doRegenerate();
  }

  async function doRegenerate() {
    setShowRegenDialog(false);
    setRegenLoading(true);
    try {
      const text = await fetchRegenerateText(draft);
      setFinalText(text);
      setManuallyEdited(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "再生成に失敗しました。");
    } finally {
      setRegenLoading(false);
    }
  }

  function reset() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
    setDraft(EMPTY_DRAFT);
    setRawInput("");
    setInitialRawInput("");
    setEvaluation(null);
    setInitialEvaluation(null);
    setEvaluatedRank("");
    setBusinessCategory(null);
    setFinalText("");
    setManuallyEdited(false);
    setError(null);
    setCopied(false);
    setSaveStatus("idle");
    setMaxStep(1);
    setStep(1);
  }

  // Pass/fail status must reflect the CURRENTLY selected rank, not the rank
  // that was active when the AI evaluation ran (assignee/category can change afterward).
  const currentRank = (draft.assignee_rank || "B") as AssigneeRank;
  const effectiveEvaluation: Evaluation | null = evaluation
    ? {
        ...evaluation,
        business_category: businessCategory,
        pass_threshold: RANK_THRESHOLDS[currentRank],
        mandatory_met: checkMandatory(currentRank, evaluation.scores, evaluation.has_sequential_steps),
        over_interference:
          currentRank === "A" &&
          (evaluation.scores.task_content === 5 || evaluation.has_sequential_steps),
        passed:
          evaluation.total >= RANK_THRESHOLDS[currentRank] &&
          checkMandatory(currentRank, evaluation.scores, evaluation.has_sequential_steps) &&
          !evaluation.consistency_error,
      }
    : null;
  const rankChanged = !!evaluatedRank && evaluatedRank !== currentRank;
  const modeChanged = !!evaluatedMode && evaluatedMode !== draft.support_mode;
  const displayMode: SupportMode = evaluatedMode || draft.support_mode;

  const STEPS = [
    { n: 1 as Step, t: "指示概要入力" },
    { n: 2 as Step, t: "評価・改善" },
    { n: 3 as Step, t: "プレビュー" },
    { n: 4 as Step, t: "GO済み" },
  ];

  // Don't render anything until sessionStorage has been read — prevents step-1 flash
  if (!sessionRestored) {
    return (
      <div className="min-h-screen">
        <div className="flex h-64 items-center justify-center">
          <span className="text-sm text-muted-foreground">読み込み中…</span>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-6 py-12">
        {/* Stepper */}
        <div className="mb-10">
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← ホームに戻る</Link>
          <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-2">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex flex-1 items-center gap-1.5">
                <button
                  onClick={() => { if (s.n <= maxStep) setStep(s.n); }}
                  disabled={s.n > maxStep}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-sm border px-2.5 py-2 text-left transition-colors ${
                    step === s.n
                      ? "border-foreground bg-foreground text-background"
                      : s.n <= maxStep
                        ? "border-border bg-card text-muted-foreground hover:text-foreground"
                        : "border-dashed border-border bg-transparent text-muted-foreground"
                  }`}
                >
                  <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-xs font-medium ${
                    step === s.n ? "bg-accent text-accent-foreground"
                      : s.n < step ? "bg-muted"
                      : s.n <= maxStep ? "bg-muted/60"
                      : "bg-muted/40"
                  }`}>
                    {s.n < step ? "✓" : s.n}
                  </div>
                  <div className="truncate text-xs font-medium">{s.t}</div>
                </button>
                {i < STEPS.length - 1 && <div className="hidden text-xs text-muted-foreground md:block">→</div>}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-sm border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 text-xs underline-offset-4 hover:underline">閉じる</button>
          </div>
        )}

        <Dialog open={showRegenDialog} onOpenChange={setShowRegenDialog}>
          <DialogContent className="max-w-sm">
            <DialogTitle>手動編集の上書き確認</DialogTitle>
            <DialogDescription>手動編集した内容が消去されますが、AIで再作成しますか？</DialogDescription>
            <div className="mt-1 flex gap-3">
              <Button className="flex-1" onClick={doRegenerate}>再作成する</Button>
              <Button className="flex-1" variant="outline" onClick={() => setShowRegenDialog(false)}>キャンセル</Button>
            </div>
          </DialogContent>
        </Dialog>

        {loading && <EvaluationProgressOverlay onCancel={() => evalAbortRef.current?.abort()} />}

        {step === 1 && (
          <StepInput
            draft={draft}
            setDraft={setDraft}
            members={members}
            templates={templates}
            onSubmit={runEvaluation}
            onLoadSample={() => setDraft(SAMPLE_DRAFT)}
            onReset={reset}
            onTemplateDeleted={fetchTemplates}
            loading={loading}
          />
        )}
        {step === 2 && effectiveEvaluation && (
          <StepEvaluate
            draft={draft}
            setDraft={setDraft}
            evaluation={effectiveEvaluation}
            businessCategory={businessCategory}
            categories={categories}
            rankChanged={rankChanged}
            evaluatedRank={evaluatedRank}
            modeChanged={modeChanged}
            displayMode={displayMode}
            onCategoryChange={handleCategoryChange}
            onReEvaluate={runEvaluation}
            onGoToPreview={async () => {
              setStep(3);
              // Auto-generate final text only when evaluation passed and text is empty
              if (effectiveEvaluation?.passed && !finalText) {
                setRegenLoading(true);
                try {
                  const text = await fetchRegenerateText(draft);
                  setFinalText(text);
                } catch { /* non-critical */ } finally {
                  setRegenLoading(false);
                }
              }
            }}
            onBack={() => setStep(1)}
            loading={loading}
          />
        )}
        {step === 3 && effectiveEvaluation && (
          <StepPreview
            draft={draft}
            setDraft={setDraft}
            evaluation={effectiveEvaluation}
            rankChanged={rankChanged}
            evaluatedRank={evaluatedRank}
            modeChanged={modeChanged}
            displayMode={displayMode}
            finalText={finalText}
            manuallyEdited={manuallyEdited}
            regenLoading={regenLoading}
            onFinalTextChange={(t) => { setFinalText(t); setManuallyEdited(true); }}
            onRegenerate={handleRegenerate}
            onReEvaluate={runEvaluation}
            loading={loading}
            onBack={() => setStep(2)}
            onGo={handleGo}
          />
        )}
        {step === 4 && effectiveEvaluation && (
          <StepDone
            draft={draft}
            evaluation={effectiveEvaluation}
            finalText={finalText}
            rawInput={rawInput}
            copied={copied}
            saveStatus={saveStatus}
            sheetsStatus={sheetsStatus}
            sheetsUrl={sheetsUrl}
            sheetsShareWarning={sheetsShareWarning}
            templates={templates}
            onCopy={() => { navigator.clipboard?.writeText(finalText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            onReset={reset}
            onTemplateSaved={fetchTemplates}
          />
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

// ============================================================
// Shared atoms
// ============================================================

// Time-based "fake" progress for the AI evaluation call. The OpenAI request
// itself reports no intermediate progress, so we approximate typical timing
// to keep the user informed during the (sometimes 20-30s) wait.
const EVAL_STEPS: Array<{ label: string; at: number }> = [
  { label: "指示内容を解析しています", at: 0 },
  { label: "担当者の習熟度を考慮しています", at: 5 },
  { label: "改善ポイントを抽出しています", at: 12 },
  { label: "改善案を生成しています", at: 22 },
];

function EvaluationProgressOverlay({ onCancel }: { onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 150);
    return () => clearInterval(id);
  }, []);

  const currentIdx = EVAL_STEPS.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);

  let pct: number;
  if (elapsed < 5) pct = (elapsed / 5) * 40;
  else if (elapsed < 12) pct = 40 + ((elapsed - 5) / 7) * 20;
  else if (elapsed < 22) pct = 60 + ((elapsed - 12) / 10) * 20;
  else if (elapsed < 35) pct = 80 + ((elapsed - 22) / 13) * 15;
  else pct = 95;

  const isSlow = elapsed > 20;
  const isVeryLong = elapsed > 50;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-sm border border-border bg-card p-6 shadow-elevated">
        <h3 className="font-serif text-lg font-semibold">AIが評価しています…</h3>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gradient-accent transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <ul className="mt-5 space-y-3">
          {EVAL_STEPS.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                    done
                      ? "bg-foreground text-background"
                      : active
                      ? "border-2 border-foreground text-foreground"
                      : "border border-border text-muted-foreground"
                  }`}
                >
                  {done ? "✓" : active ? <span className="block h-2 w-2 animate-pulse rounded-full bg-foreground" /> : i + 1}
                </span>
                <span className={done || active ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
              </li>
            );
          })}
        </ul>
        {isSlow && !isVeryLong && (
          <p className="mt-4 text-xs text-muted-foreground">通常より時間がかかっています。もう少しお待ちください…</p>
        )}
        {isVeryLong && (
          <div className="mt-4 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-xs text-amber-700">処理に時間がかかっています。このまましばらくお待ちください。</p>
            <p className="mt-1 text-xs text-amber-600/80">タイムアウトが発生した場合は、評価精度を「通常」に切り替えて再試行してください。</p>
          </div>
        )}
        {isSlow && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-4 w-full rounded-sm border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            キャンセルする
          </button>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <UiCard>{children}</UiCard>;
}
function CardHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="border-b border-border bg-muted/30 px-6 py-4">
      <PageHeader eyebrow={eyebrow} title={title} description={description} as="h2" size="sm" mono compact />
    </div>
  );
}
function SidebarTip({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "muted" }) {
  return (
    <div className={`rounded-sm border p-4 ${tone === "muted" ? "border-dashed border-border bg-transparent" : "border-border bg-card shadow-paper"}`}>
      <div className="font-serif text-sm font-semibold">{title}</div>
      <ul className="mt-2 space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />{it}
          </li>
        ))}
      </ul>
    </div>
  );
}
function AutosizeTA({ value, onChange, minRows, className = "", ...rest }: { value: string; minRows: number; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; className?: string } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value" | "rows">) {
  const ref = useAutosizeTextarea(value, minRows);
  return <textarea ref={ref} value={value} onChange={onChange} rows={1} className={className} {...rest} />;
}

// ============================================================
// Deadline picker
// ============================================================
const DAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;
function formatDeadline(date: Date, time: string) {
  const ymd = date.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
  return `${ymd}（${DAYS_JA[date.getDay()]}） ${time}`;
}
function DeadlineInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date | undefined>();
  const [pickedTime, setPickedTime] = useState("17:00");
  return (
    <div className="flex gap-2">
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="例：2026-05-20（水） 17:00"
        className="flex-1 rounded-sm border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-foreground focus:outline-none" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center justify-center rounded-sm border border-border bg-background px-3 py-2 text-muted-foreground hover:border-foreground hover:text-foreground">
            <CalendarClockIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="single" selected={pickedDate} onSelect={(d) => { if (!d) return; setPickedDate(d); onChange(formatDeadline(d, pickedTime)); }} initialFocus />
          <div className="border-t border-border px-4 py-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">時刻</div>
            <div className="flex gap-2">
              <input type="time" value={pickedTime} onChange={(e) => { setPickedTime(e.target.value); if (pickedDate) onChange(formatDeadline(pickedDate, e.target.value)); }}
                className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
              <button type="button" onClick={() => setOpen(false)} disabled={!pickedDate}
                className="rounded-sm bg-foreground px-4 py-2 text-xs font-medium text-background disabled:opacity-40">確定</button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============================================================
// Step 1: Input
// ============================================================
function StepInput({ draft, setDraft, members, templates, onSubmit, onLoadSample, onReset, onTemplateDeleted, loading }: {
  draft: InstructionDraft;
  setDraft: React.Dispatch<React.SetStateAction<InstructionDraft>>;
  members: MemberProfile[];
  templates: InstructionTemplate[];
  onSubmit: () => void;
  onLoadSample: () => void;
  onReset: () => void;
  onTemplateDeleted: () => void;
  loading: boolean;
}) {
  const [overviewTouched, setOverviewTouched] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  // 16-6追記: テンプレート読み込みは内容を確認してから実行する（誤タップでの上書き防止）
  const [previewTemplate, setPreviewTemplate] = useState<InstructionTemplate | null>(null);
  // 16-6追記: テンプレート削除（誤登録の取り消し用）
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedLabel, setDeletedLabel] = useState<string | null>(null);
  const hasError = overviewTouched && !draft.overview.trim();

  // PIIガード（送信前の検知＋確認）— pii-guard.tsは正規表現ベースの一次防御。
  // evaluate-core.ts側のSECURITY_PREAMBLE（AIによる固有名詞一般化）が二段目。
  const [piiConfirm, setPiiConfirm] = useState<PiiMatch[] | null>(null);

  function draftText(): string {
    return [draft.overview, draft.deadline, draft.estimated_hours, draft.constraints]
      .filter(Boolean)
      .join("\n");
  }

  function handleEvaluateClick() {
    setOverviewTouched(true);
    if (!draft.overview.trim()) return;
    const matches = detectPii(draftText());
    if (matches.length > 0) {
      setPiiConfirm(matches);
      return;
    }
    onSubmit();
  }

  function handlePiiReplace() {
    if (!piiConfirm) return;
    setDraft((prev) => ({
      ...prev,
      overview: redactPii(prev.overview, piiConfirm),
      deadline: redactPii(prev.deadline, piiConfirm),
      estimated_hours: redactPii(prev.estimated_hours, piiConfirm),
      constraints: redactPii(prev.constraints, piiConfirm),
    }));
    setPiiConfirm(null);
    // 自動置換は必ずしも正確とは限らないため、置換直後には自動送信せず、
    // 内容を確認してからもう一度「品質を評価する」を押してもらう。
  }

  function handlePiiSendAsIs() {
    setPiiConfirm(null);
    onSubmit();
  }

  async function deleteTemplate(t: InstructionTemplate) {
    setDeletingTemplate(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/instruction-templates?slot=${t.slot}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "削除に失敗しました");
      }
      if (previewTemplate?.id === t.id) setPreviewTemplate(null);
      setDeleteConfirmId(null);
      setDeletedLabel(t.label);
      onTemplateDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeletingTemplate(false);
    }
  }

  function handleAssigneeSelect(name: string) {
    setDraft((prev) => ({ ...prev, assignee_name: name }));
  }

  function applyTemplate(t: InstructionTemplate) {
    setDraft((prev) => ({
      ...prev,
      overview: t.overview,
      constraints: t.constraints,
      tone: t.tone,
      support_mode: t.support_mode,
      importance: t.importance,
    }));
    setOverviewTouched(false);
    setPreviewTemplate(null);
  }

  return (
    <div className="space-y-5">
      {/* Settings strip */}
      <div className="rounded-sm border border-border bg-card shadow-paper">
        <div className="flex flex-wrap gap-px divide-x divide-border">
          {/* Assignee */}
          <div className="flex-1 min-w-[200px] px-5 py-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">担当者</div>
            {members.length > 0 ? (
              <select
                value={draft.assignee_name}
                onChange={(e) => handleAssigneeSelect(e.target.value)}
                className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm focus:border-foreground focus:outline-none"
              >
                <option value="">（未選択）</option>
                {members.map((m) => (
                  <option key={m.id} value={m.name}>{m.name}{m.email ? ` (${m.email})` : ""}</option>
                ))}
              </select>
            ) : (
              <input type="text" value={draft.assignee_name}
                onChange={(e) => setDraft((prev) => ({ ...prev, assignee_name: e.target.value }))}
                placeholder="担当者名を入力"
                className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm focus:border-foreground focus:outline-none" />
            )}
            {draft.assignee_rank && (
              <div className="mt-1 text-xs text-muted-foreground">
                担当者の指示レベル（推定）：<span className="font-mono font-bold text-foreground">{draft.assignee_rank}</span>（{RANK_LABELS[draft.assignee_rank as AssigneeRank]?.short}：{RANK_LABELS[draft.assignee_rank as AssigneeRank]?.description}）— 業務分類の確定後に正式な指示レベルが決まります
              </div>
            )}
          </div>

          {/* Mode */}
          <div className="shrink-0 px-5 py-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">支援モード</div>
            <div className="flex gap-1.5">
              {(["efficiency", "coaching"] as SupportMode[]).map((m) => (
                <button key={m} type="button" onClick={() => setDraft((prev) => ({ ...prev, support_mode: m }))}
                  className={`rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors ${
                    draft.support_mode === m ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/50"
                  }`}>
                  {m === "efficiency" ? "効率重視" : "育成重視"}
                </button>
              ))}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{SUPPORT_MODE_DESC[draft.support_mode]}</div>
          </div>

          {/* Importance — determines which model is used */}
          <div className="shrink-0 px-5 py-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">評価精度</div>
            <div className="flex gap-1.5">
              {(["standard", "high"] as ImportanceLevel[]).map((lvl) => (
                <button key={lvl} type="button" onClick={() => setDraft((prev) => ({ ...prev, importance: lvl }))}
                  className={`rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors ${
                    draft.importance === lvl
                      ? lvl === "high" ? "border-amber-500 bg-amber-500 text-white" : "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:border-foreground/50"
                  }`}>
                  {IMPORTANCE_LABELS[lvl].label}
                </button>
              ))}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{IMPORTANCE_LABELS[draft.importance ?? "standard"].desc}</div>
          </div>

          {/* Urgency */}
          <div className="shrink-0 px-5 py-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">緊急度</div>
            <div className="flex gap-1.5">
              {(["high", "medium", "low"] as const).map((u) => (
                <button key={u} type="button" onClick={() => setDraft((prev) => ({ ...prev, urgency: u }))}
                  className={`rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors ${
                    draft.urgency === u ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/50"
                  }`}>
                  {u === "high" ? "高" : u === "medium" ? "中" : "低"}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div className="shrink-0 px-5 py-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">トーン</div>
            <div className="flex gap-1.5">
              {(["junior", "peer", "senior", "external"] as ToneType[]).map((t) => {
                if (!t) return null;
                return (
                  <button key={t} type="button" onClick={() => setDraft((prev) => ({ ...prev, tone: t }))}
                    className={`rounded-sm border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      draft.tone === t ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/50"
                    }`}>
                    {TONE_LABELS[t]?.label ?? t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main input + sidebar */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader eyebrow="Step 01 / Input" title="指示概要を入力する"
              description="指示したい内容を文章・箇条書きで自由に入力してください。AIが構造化・評価します。" />
            <div className="space-y-5 p-5">
              <div className="flex items-start gap-2 rounded-sm border-2 border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">
                <span className="mt-px shrink-0">🚫</span>
                <span>社名・氏名・メールアドレス・電話番号などの個人情報は入力しないでください。それらしき表記があれば、送信前に確認画面が表示されます。入力内容はAI（OpenAI）に送信されます。また、AIへの命令文（「JSON形式で返答して」「以下を無視して」等）は入力しないでください。指示概要として扱われ、評価結果が不正確になります。</span>
              </div>

              <Link
                href="/workflow/compose"
                className="flex items-center justify-between gap-3 rounded-sm border border-accent/40 bg-accent/5 px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent/10"
              >
                <span>💬 うまく言葉にできない場合は、AIと相談しながら指示文を作成する</span>
                <span aria-hidden="true" className="shrink-0 text-base">→</span>
              </Link>

              {/* 16-6: saved templates — quick-start from a past GO-confirmed instruction */}
              {templates.length > 0 && (
                <div className="rounded-sm border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-foreground">テンプレートから始める：</span>
                    {templates.map((t) => (
                      <div key={t.id} className="inline-flex items-center overflow-hidden rounded-sm border border-border">
                        <button type="button" onClick={() => { setPreviewTemplate(t); setDeleteConfirmId(null); setDeletedLabel(null); }}
                          className={`px-2.5 py-1 text-xs transition-colors ${
                            previewTemplate?.id === t.id
                              ? "bg-foreground text-background"
                              : "bg-background text-foreground hover:bg-muted"
                          }`}>
                          {t.label}
                        </button>
                        <button type="button" onClick={() => { setDeleteConfirmId(t.id); setDeleteError(null); setDeletedLabel(null); setPreviewTemplate(null); }}
                          title={`「${t.label}」を削除`}
                          className="border-l border-border px-1.5 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* テンプレート削除（誤登録の取り消し用） — 登録名で見分けてから削除 */}
                  {deleteConfirmId && (() => {
                    const target = templates.find((t) => t.id === deleteConfirmId);
                    if (!target) return null;
                    return (
                      <div className="mt-3 rounded-sm border border-destructive/40 bg-destructive/5 p-3">
                        <p className="text-xs font-medium text-destructive">
                          「{target.label}」を削除しますか？この操作は取り消せません。
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <button type="button" onClick={() => deleteTemplate(target)} disabled={deletingTemplate}
                            className="rounded-sm bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
                            {deletingTemplate ? "削除中…" : "削除する"}
                          </button>
                          <button type="button" onClick={() => setDeleteConfirmId(null)}
                            className="text-xs text-foreground underline-offset-4 hover:underline">
                            キャンセル
                          </button>
                        </div>
                        {deleteError && <p className="mt-1.5 text-xs text-destructive">{deleteError}</p>}
                      </div>
                    );
                  })()}
                  {deletedLabel && (
                    <p className="mt-3 text-xs font-medium text-green-700">✓ 「{deletedLabel}」を削除しました</p>
                  )}

                  {/* 内容を確認してから読み込む（誤って現在の入力を上書きしないように） */}
                  {previewTemplate && (
                    <div className="mt-3 rounded-sm border border-accent/40 bg-card p-3">
                      <div className="text-xs font-semibold text-foreground">
                        「{previewTemplate.label}」を読み込みますか？
                      </div>
                      <p className="mt-2 whitespace-pre-wrap rounded-sm bg-muted/50 p-2.5 text-xs leading-relaxed text-foreground">
                        {previewTemplate.overview}
                      </p>
                      {previewTemplate.constraints && (
                        <p className="mt-1.5 text-xs leading-relaxed text-foreground">
                          <span className="font-medium">注意点・制約：</span>{previewTemplate.constraints}
                        </p>
                      )}
                      {draft.overview.trim() && (
                        <p className="mt-2 text-xs font-medium text-destructive">
                          ⚠ 現在入力中の内容は削除され、この内容に置き換わります。
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <button type="button" onClick={() => applyTemplate(previewTemplate)}
                          className="rounded-sm bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
                          この内容を読み込む
                        </button>
                        <button type="button" onClick={() => setPreviewTemplate(null)}
                          className="text-xs text-foreground underline-offset-4 hover:underline">
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Overview — the only required field */}
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label className="font-serif text-base font-semibold">
                    指示概要 <span className="text-xs text-accent">*</span>
                    <span className="ml-2 text-xs font-sans font-normal text-muted-foreground">文章・箇条書き、どちらでも可</span>
                  </label>
                  <span className="font-mono text-xs text-muted-foreground">{draft.overview.length}/1000</span>
                </div>
                <AutosizeTA value={draft.overview}
                  onChange={(e) => setDraft((prev) => ({ ...prev, overview: e.target.value }))}
                  onBlur={() => setOverviewTouched(true)}
                  minRows={6} maxLength={1000}
                  placeholder={"例：\nA社向けの提案資料を来週火曜のミーティングまでに作ってほしい。\nPowerPointで10ページくらい。構成は現状課題→提案→効果→費用。\n社外秘情報は入れないこと。テンプレはv3を使う。"}
                  className={`w-full resize-none overflow-hidden rounded-sm border bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none ${
                    hasError ? "border-destructive" : "border-border focus:border-foreground"
                  }`} />
                {hasError && <p className="mt-1 text-xs text-destructive">指示概要は必須です</p>}
              </div>

              {/* Fields that affect pass/fail — auto-extracted but worth checking */}
              <div className="rounded-sm border border-border/50 bg-muted/30 p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">期限・工数・制約</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    合格基準に影響します
                  </span>
                </div>
                <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                  指示概要に記載があればAIが自動抽出しますが、未記載のままだと評価が下がり不合格の原因になります。
                  期限・見込み工数は全指示レベル共通の必須条件（3点以上）、注意点・制約はC・D指示レベル担当者への必須条件（4点以上）です。
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      期限
                      <span className="ml-1 text-muted-foreground/50 font-normal">— 概要に書いてあれば自動抽出／全指示レベル必須：3点以上</span>
                    </label>
                    <div className="mt-1">
                      <DeadlineInput value={draft.deadline} onChange={(v) => setDraft((prev) => ({ ...prev, deadline: v }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      見込み工数
                      <span className="ml-1 text-muted-foreground/50 font-normal">— 概要に書いてあれば自動抽出／全指示レベル必須：3点以上</span>
                    </label>
                    <input type="text" value={draft.estimated_hours}
                      onChange={(e) => setDraft((prev) => ({ ...prev, estimated_hours: e.target.value }))}
                      placeholder="例：3時間、半日、2日程度"
                      className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-foreground focus:outline-none" />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-xs font-medium text-muted-foreground">
                    注意点・制約
                    <span className="ml-1 text-muted-foreground/50 font-normal">— 概要に書いてあれば自動抽出／C・D指示レベルは必須：4点以上</span>
                  </label>
                  <AutosizeTA value={draft.constraints}
                    onChange={(e) => setDraft((prev) => ({ ...prev, constraints: e.target.value }))}
                    minRows={2} maxLength={300}
                    placeholder="例：社外秘情報は記載しない／既存テンプレv3使用"
                    className="mt-1 w-full resize-none overflow-hidden rounded-sm border border-border bg-background px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground/50 focus:border-foreground focus:outline-none" />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <div className="flex items-center gap-3">
                  <button onClick={onLoadSample} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    曖昧な例を読み込む
                  </button>
                  {/* Reset button */}
                  {!confirmReset ? (
                    <button
                      type="button"
                      onClick={() => setConfirmReset(true)}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                    >
                      入力をリセット
                    </button>
                  ) : (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-destructive">入力と評価履歴をすべて削除しますか？</span>
                      <button
                        type="button"
                        onClick={() => { onReset(); setConfirmReset(false); }}
                        className="rounded-sm bg-destructive px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                      >
                        削除する
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmReset(false)}
                        className="text-muted-foreground underline-offset-4 hover:underline"
                      >
                        キャンセル
                      </button>
                    </span>
                  )}
                </div>
                <button onClick={handleEvaluateClick}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-sm bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                  {loading ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-background/40 border-t-background" />評価中…</> : <>品質を評価する <span>→</span></>}
                </button>

                <Dialog open={!!piiConfirm} onOpenChange={(open) => { if (!open) setPiiConfirm(null); }}>
                  <DialogContent className="max-w-md">
                    <DialogTitle>⚠ 個人情報・社名らしき表記が見つかりました</DialogTitle>
                    <DialogDescription>
                      入力内容はAI（OpenAI）に送信されます。「A社」のような一般的な表記に置き換えることをおすすめします。
                    </DialogDescription>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                      {(piiConfirm ?? []).map((m, i) => (
                        <li key={i}>{PII_KIND_LABEL[m.kind]}：「{m.text}」</li>
                      ))}
                    </ul>
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                      <Button className="flex-1" onClick={handlePiiReplace}>一般的な表記に置き換える</Button>
                      <Button className="flex-1" variant="outline" onClick={handlePiiSendAsIs}>このまま送信する</Button>
                      <Button className="flex-1" variant="outline" onClick={() => setPiiConfirm(null)}>キャンセルして編集する</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <SidebarTip title="うまく使うコツ" items={[
            "走り書きやメモをそのまま貼り付けてOK",
            "期限・工数を入力するとより正確に評価",
            "担当者を選ぶとプロファイルが自動反映",
            "手順がある場合は「1. 2. 3.」「①②③」または「まず〜次に〜最後に」の形式で記載すると、AIが時系列の手順として認識します（D指示レベル〈要指導〉担当者への指示では合格の必須条件）",
          ]} />
          <SidebarTip title="AIが行うこと" items={[
            "指示概要から6項目を抽出・構造化",
            "担当者の指示レベルに応じた合格基準で判定",
            "モード別の改善コメントを生成",
            "合格後に最終指示文を生成",
          ]} />
          <SidebarTip title="このシステムが行わないこと" items={[
            "業務内容そのものの正解を提示すること",
            "指示者の判断を代わりに行うこと",
            "担当者本人の人事評価",
          ]} tone="muted" />
        </aside>
      </div>
    </div>
  );
}

// ============================================================
// Missing optional field prompts (shown in Step 2)
// ============================================================
const MISSING_MARKER = "（未記載）";

function MissingFieldPrompts({
  rank, ext, draft, setDraft,
}: {
  rank: AssigneeRank;
  ext: Evaluation["structured_extraction"];
  draft: InstructionDraft;
  setDraft: React.Dispatch<React.SetStateAction<InstructionDraft>>;
}) {
  if (!ext) return null;

  // Determine which optional fields are truly missing (not in draft AND not extracted)
  const deadlineMissing =
    !draft.deadline &&
    (!ext.deadline_extracted || ext.deadline_extracted === MISSING_MARKER);
  const workloadMissing =
    !draft.estimated_hours &&
    (!ext.workload_extracted || ext.workload_extracted === MISSING_MARKER);
  const constraintsMissing =
    !draft.constraints &&
    (!ext.constraints_extracted || ext.constraints_extracted === MISSING_MARKER);

  // Rank-based importance: deadline + workload required for all ranks (3pts+)
  const deadlineRequired  = true; // every rank needs deadline >= 3
  const workloadRequired  = true; // every rank needs workload >= 3
  const constraintsNeeded = rank === "C" || rank === "D"; // mandatory 5pts for C/D

  const prompts: Array<{
    id: string;
    label: string;
    hint: string;
    urgent: boolean;
    field: keyof InstructionDraft;
    placeholder: string;
  }> = [
    ...(deadlineMissing && deadlineRequired ? [{
      id: "deadline",
      label: "期限が未設定です",
      hint: `指示レベル${rank}の合格条件に期限（3点以上）が必要です。指示概要に含まれていないため、下に入力してください。`,
      urgent: rank === "C" || rank === "D",
      field: "deadline" as const,
      placeholder: "例：2026-05-30（土） 17:00",
    }] : []),
    ...(workloadMissing && workloadRequired ? [{
      id: "workload",
      label: "見込み工数が未設定です",
      hint: `指示レベル${rank}の合格条件に見込み工数（3点以上）が必要です。作業の期待値を数値で示してください。`,
      urgent: rank === "C" || rank === "D",
      field: "estimated_hours" as const,
      placeholder: "例：3時間、半日、2日程度",
    }] : []),
    ...(constraintsMissing && constraintsNeeded ? [{
      id: "constraints",
      label: "注意点・制約が未設定です",
      hint: `指示レベル${rank}への指示は注意点・制約の明示（5点）が必須条件です。NG事項・優先順位・使用ルールを入力してください。`,
      urgent: true,
      field: "constraints" as const,
      placeholder: "例：社外秘情報は記載しない／テンプレv3使用／優先度：構成 > デザイン",
    }] : []),
  ];

  if (prompts.length === 0) return null;

  return (
    <div className="space-y-2">
      {prompts.map((p) => (
        <div key={p.id}
          className={`rounded-sm border px-5 py-4 ${
            p.urgent
              ? "border-amber-400/60 bg-amber-50/50"
              : "border-blue-300/60 bg-blue-50/50"
          }`}>
          <div className={`flex items-center gap-2 text-sm font-medium ${p.urgent ? "text-amber-700" : "text-blue-700"}`}>
            <span>{p.urgent ? "⚠" : "ℹ"} {p.label}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{p.hint}</p>
          <div className="mt-3">
            <input
              type="text"
              value={draft[p.field] as string}
              onChange={(e) => setDraft((prev) => ({ ...prev, [p.field]: e.target.value }))}
              placeholder={p.placeholder}
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-foreground focus:outline-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">入力後「再評価」ボタンを押してください。</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Step 2: Evaluate + revise (combined)
// ============================================================
function StepEvaluate({ draft, setDraft, evaluation, businessCategory, categories, rankChanged, evaluatedRank, modeChanged, displayMode, onCategoryChange, onReEvaluate, onGoToPreview, onBack, loading }: {
  draft: InstructionDraft;
  setDraft: React.Dispatch<React.SetStateAction<InstructionDraft>>;
  evaluation: Evaluation;
  businessCategory: BusinessCategory | null;
  categories: Categories;
  rankChanged: boolean;
  evaluatedRank: AssigneeRank | "";
  modeChanged: boolean;
  displayMode: SupportMode;
  onCategoryChange: (cat: BusinessCategory) => void;
  onReEvaluate: () => void;
  onGoToPreview: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const rank = (draft.assignee_rank || "B") as AssigneeRank;
  const avg = (evaluation.total / 6).toFixed(1);
  const ext = evaluation.structured_extraction;

  const EXTRACTED_LABELS: Array<{ key: keyof typeof ext; label: string; scoreKey: string }> = [
    { key: "purpose_background",    label: "目的・背景",       scoreKey: "purpose_background" },
    { key: "task_content",          label: "依頼内容・作業内容", scoreKey: "task_content" },
    { key: "completion_deliverable",label: "完了条件・成果物",  scoreKey: "completion_deliverable" },
    { key: "deadline_extracted",    label: "期限",             scoreKey: "deadline_clarity" },
    { key: "workload_extracted",    label: "見込み工数",        scoreKey: "workload_estimate" },
    { key: "constraints_extracted", label: "注意点・制約",      scoreKey: "constraints_notes" },
  ];

  // 一括反映（効率重視モードのみ）: スコア5は変更不要、スコア1は書き換え文ではなく
  // 確認したい質問のため反映対象外。スコア2〜4の「次のように書き直してください：
  // 『〇〇』」から『』内の書き換え文のみを抽出して反映する。
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const extractQuote = (suggestion: string): string | null => {
    const m = suggestion.match(/『([^』]*)』/);
    return m ? m[1] : null;
  };
  const applicableSuggestions =
    displayMode === "efficiency"
      ? evaluation.comments
          .filter((c) => c.score >= 2 && c.score <= 4)
          .map((c) => extractQuote(c.suggestion))
          .filter((s): s is string => !!s)
      : [];

  async function handleApplySuggestions() {
    if (applying || applicableSuggestions.length === 0) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch("/api/revise-overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overview: draft.overview, suggestions: applicableSuggestions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "反映に失敗しました");
      // このStep2画面自体に編集可能な指示概要欄があるため、そのまま上書きして
      // その場で確認できるようにする（画面遷移は不要）。
      setDraft((prev) => ({ ...prev, overview: data.overview }));
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "反映に失敗しました");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Alert banners */}
      {evaluation.consistency_error && (
        <div className="rounded-sm border border-destructive/50 bg-destructive/5 px-5 py-4">
          <div className="text-sm font-medium text-destructive">⚠ 工数・納期の矛盾が検出されました</div>
          <p className="mt-1 text-sm text-destructive/80">{evaluation.consistency_error}</p>
          <p className="mt-1 text-xs text-muted-foreground">指示概要または任意入力を修正して再評価してください。</p>
        </div>
      )}
      {evaluation.over_interference && (
        <div className="rounded-sm border border-amber-400/50 bg-amber-50/50 px-5 py-4">
          <div className="text-sm font-medium text-amber-700">過干渉の疑い</div>
          <p className="mt-1 text-sm text-amber-700/80">
            指示レベルA担当者には目的だけを伝え、手順の詳細指定は裁量を奪います。依頼内容の詳細度を下げることを検討してください。
          </p>
        </div>
      )}
      {rank === "D" && !evaluation.has_sequential_steps && (
        <div className="rounded-sm border border-amber-400/50 bg-amber-50/50 px-5 py-4">
          <div className="text-sm font-medium text-amber-700">⚠ 手順が「時系列の手順」として認識されていません</div>
          <p className="mt-1 text-sm text-amber-700/80">
            指示レベルD（要指導）への指示には、3ステップ以上の時系列手順が必須条件です。
            「担当者が何を最初に・次に・最後にやるか」が順序として読み取れる書き方になっているか確認してください。
            「・」「-」の箇条書きだけでは並列リストと判断される場合があります。
            指示概要を修正して「再評価」を押してください。
          </p>
        </div>
      )}

      {/* Missing optional field prompts */}
      <MissingFieldPrompts
        rank={rank}
        ext={ext}
        draft={draft}
        setDraft={setDraft}
      />

      {/* Business category */}
      {businessCategory && (
        <div className="rounded-sm border border-border bg-card px-5 py-3">
          <div className="flex items-baseline gap-2">
            <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">AI業務分類（修正可）</div>
            <div className="font-medium">{businessCategory.major_label} › {businessCategory.sub_label}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {categories.map((cat) =>
              cat.subs.map((sub) => (
                <button key={sub.sub} type="button"
                  onClick={() => onCategoryChange({ major: cat.major, major_label: cat.label, sub: sub.sub, sub_label: sub.label })}
                  className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                    businessCategory.sub === sub.sub ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:border-foreground/50"
                  }`}>
                    {sub.sub} {sub.label}
                  </button>
                ))
            )}
          </div>
          {rank && (
            <div className="mt-1.5 text-xs text-muted-foreground">
              適用指示レベル：<span className="font-mono font-bold text-foreground">{rank}</span>（{RANK_LABELS[rank].short}）— 合格基準 {evaluation.pass_threshold}/30点以上
            </div>
          )}
        </div>
      )}

      {/* Top row: overview input (left) + score summary (right) */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* LEFT: editable overview */}
        <Card>
          <CardHeader eyebrow="指示概要（修正可）" title="指示者が入力した指示概要"
            description="修正後「再評価」ボタンを押すと、構造化データと評価がすべて再生成されます。" />
          <div className="p-5">
            <AutosizeTA value={draft.overview}
              onChange={(e) => setDraft((prev) => ({ ...prev, overview: e.target.value }))}
              minRows={5}
              className="w-full resize-none overflow-hidden rounded-sm border border-border bg-background px-4 py-3 text-sm leading-relaxed focus:border-foreground focus:outline-none" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">期限（合格条件：3点以上）</label>
                <DeadlineInput value={draft.deadline} onChange={(v) => setDraft((prev) => ({ ...prev, deadline: v }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">見込み工数（合格条件：3点以上）</label>
                <input type="text" value={draft.estimated_hours}
                  onChange={(e) => setDraft((prev) => ({ ...prev, estimated_hours: e.target.value }))}
                  placeholder="例：3時間"
                  className="mt-0.5 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-xs text-muted-foreground">注意点・制約（C・D必須：4点以上）</label>
              <textarea value={draft.constraints}
                onChange={(e) => setDraft((prev) => ({ ...prev, constraints: e.target.value }))}
                rows={2}
                placeholder="例：社外秘情報は除外 / テンプレv3使用 / 優先度：構成 > デザイン"
                className="mt-0.5 w-full resize-none rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
            </div>

            {displayMode === "efficiency" && applicableSuggestions.length > 0 && (
              <div className="mt-3 rounded-sm border border-accent/40 bg-accent/5 p-3">
                <button
                  type="button"
                  onClick={handleApplySuggestions}
                  disabled={applying}
                  className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {applying ? (
                    <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/40 border-t-background" />反映中…</>
                  ) : (
                    `修正文案を一括反映する（${applicableSuggestions.length}件）`
                  )}
                </button>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  スコア2〜4の書き換え文案（『』内）のみを、上の指示概要に自然な形で合成します。反映後は内容を確認してから「再評価」を押してください。
                </p>
                {applyError && <p className="mt-1.5 text-xs text-destructive">{applyError}</p>}
              </div>
            )}
          </div>
        </Card>

        {/* RIGHT: score summary */}
        <Card>
          <div className="p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">合計スコア</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-serif text-5xl font-semibold leading-none">{evaluation.total}</span>
                  <span className="font-serif text-xl text-muted-foreground">/ 30</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">平均 {avg} / 5.0</div>
              </div>
              <div className="space-y-1.5">
                <div className={`rounded-sm border px-3 py-1.5 text-xs font-medium ${
                  evaluation.total >= evaluation.pass_threshold
                    ? "border-green-400/50 bg-green-50/50 text-green-700"
                    : "border-destructive/40 bg-destructive/5 text-destructive"
                }`}>
                  {evaluation.total >= evaluation.pass_threshold
                    ? `✓ スコア合格（${evaluation.pass_threshold}点以上）`
                    : `✗ スコア不足（${evaluation.pass_threshold}点以上必要）`}
                </div>
                <div className={`rounded-sm border px-3 py-1.5 text-xs font-medium ${
                  evaluation.mandatory_met
                    ? "border-green-400/50 bg-green-50/50 text-green-700"
                    : "border-amber-400/50 bg-amber-50/50 text-amber-700"
                }`}>
                  {evaluation.mandatory_met ? "✓ 必須条件クリア" : "✗ 必須条件が未達です（下記参照）"}
                </div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gradient-accent transition-all" style={{ width: `${(evaluation.total / 30) * 100}%` }} />
            </div>
            {!evaluation.mandatory_met && (
              <div className="mt-3 rounded-sm bg-muted/50 p-3">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">必須条件（未達項目あり）</div>
                <ul className="mt-1.5 space-y-1">
                  {getMandatoryLabel(rank).map((label) => {
                    const scores = evaluation.scores as Record<string, number>;
                    const met = checkItemMetLocal(rank, label, scores, evaluation.has_sequential_steps);
                    return (
                      <li key={label} className="flex items-center gap-1.5 text-xs">
                        <span className={met ? "text-green-600" : "text-destructive"}>{met ? "✓" : "✗"}</span>
                        <span className={met ? "text-muted-foreground" : "font-medium text-foreground"}>{label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="mt-4 rounded-sm bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">修正方法：</strong>上の概要テキストを書き直して「再評価」を押してください。
              AIが6項目を再抽出・再評価します。
            </div>
          </div>
        </Card>
      </div>

      {/* Aligned 6-item rows: extracted content (left) ↔ score+comment (right) */}
      <Card>
        {/* Header row: two column labels + mode toggle */}
        <div className="border-b border-border bg-muted/30 px-6 py-4">
          {/* Mode toggle on its own line at the top */}
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="text-xs font-medium text-foreground">
              支援モード：
              <span className={`ml-1 font-semibold ${draft.support_mode === "efficiency" ? "text-accent" : "text-blue-600"}`}>
                {draft.support_mode === "efficiency" ? "効率重視（代筆）" : "育成重視（助言）"}
              </span>
              <span className="ml-2 text-muted-foreground text-xs font-normal">
                {draft.support_mode === "efficiency"
                  ? "— 指示者がそのまま使える修正文案を提示"
                  : "— 指示者が自分で考えるための問いかけを提示"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {(["efficiency", "coaching"] as SupportMode[]).map((m) => (
                <button key={m} type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, support_mode: m }))}
                  className={`rounded-sm border px-2.5 py-1 text-xs font-medium transition-colors ${
                    draft.support_mode === m
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/50"
                  }`}>
                  {m === "efficiency" ? "効率重視" : "育成重視"}
                </button>
              ))}
            </div>
          </div>
          {modeChanged && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-sm border border-amber-300/60 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-800">
                ⚠ 下のコメントはまだ「{SUPPORT_MODE_LABELS[displayMode]}」モードのままです。「{SUPPORT_MODE_LABELS[draft.support_mode]}」モードの内容にするには再評価してください。
              </p>
              <button type="button" onClick={onReEvaluate} disabled={loading}
                className="shrink-0 rounded-sm bg-amber-800 px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40">
                今すぐ再評価
              </button>
            </div>
          )}
          {/* Two column labels */}
          <div className="grid grid-cols-2 gap-px">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">AI構造化結果</div>
              <div className="mt-0.5 text-sm font-semibold">抽出された内容</div>
              <div className="mt-0.5 text-xs text-muted-foreground">概要から自動抽出（確認用・読み取り専用）</div>
            </div>
            <div className="pl-4 border-l border-border">
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                {displayMode === "efficiency" ? "効率重視 — 修正文案" : "育成重視 — 考えるヒント"}
              </div>
              <div className="mt-0.5 text-sm font-semibold">スコアと改善コメント</div>
              <div className="mt-0.5 text-xs text-muted-foreground">各項目の評価理由と改善アドバイス</div>
              {rankChanged && (
                <div className="mt-1.5 text-xs text-blue-600">
                  ※ コメントは指示レベル{evaluatedRank}基準。指示レベル{rank}に最適化するには「再評価」を押してください。
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="divide-y divide-border">
          {EXTRACTED_LABELS.map(({ key, label, scoreKey }) => {
            const comment = evaluation.comments.find((c) => c.key === scoreKey);
            const extracted = ext?.[key];
            const isEmpty = !extracted || extracted === "（未記載）";
            return (
              <div key={key} className="grid grid-cols-2 gap-px bg-border">
                {/* LEFT: extracted content */}
                <div className="bg-card px-5 py-4">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</span>
                  </div>
                  {isEmpty ? (
                    <p className="text-sm text-muted-foreground/40 italic">（抽出できませんでした）</p>
                  ) : key === "completion_deliverable" ? (
                    renderCompletionDeliverable(extracted as string)
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{extracted}</p>
                  )}
                </div>

                {/* RIGHT: score + comment */}
                <div className="bg-card px-5 py-4">
                  {comment ? (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <ScoreBadge score={comment.score} size="sm" />
                        <span className="text-xs text-muted-foreground">{SCORE_LABELS[comment.score]}</span>
                      </div>
                      {comment.score < 5 ? (
                        <>
                          <p className="text-xs leading-relaxed text-muted-foreground">{comment.reason}</p>
                          <div className={`mt-2 rounded-sm p-2.5 text-xs leading-relaxed ${
                            displayMode === "efficiency"
                              ? "border-l-2 border-accent bg-accent/5 text-foreground"
                              : "border-l-2 border-blue-400 bg-blue-50/50 text-foreground"
                          }`}>
                            <div className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                              {displayMode === "efficiency"
                                ? (comment.suggestion.includes("？") ? "確認したいこと" : "修正文案")
                                : "考えるヒント"}
                            </div>
                            {comment.suggestion}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-green-600">✓ この項目は明確に記載されています。</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground/40">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Milestones */}
      {evaluation.milestones && evaluation.milestones.length > 0 && (
        <Card>
          <CardHeader eyebrow="進捗確認ポイント" title="マイルストーン（自動提案）" />
          <ul className="divide-y divide-border">
            {evaluation.milestones.map((m, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent">{i + 1}</span>
                <span className="text-sm leading-relaxed">{m}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Action bar */}
      <p className="text-center text-xs text-muted-foreground">
        内容を確認できたら「プレビューへ進む」へ進んでください。合格基準を満たしていない場合は、次の画面で不足している項目と対処方法が表示されます。
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-card px-5 py-4">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">← 入力に戻る</button>
        <div className="flex gap-3">
          <button onClick={onReEvaluate} disabled={loading}
            className="inline-flex items-center gap-2 rounded-sm border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40">
            {loading ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />再評価中…</> : "再評価"}
          </button>
          <button onClick={onGoToPreview}
            className="inline-flex items-center gap-2 rounded-sm bg-foreground px-6 py-2.5 text-sm font-medium text-background hover:opacity-90">
            プレビューへ進む →
          </button>
        </div>
      </div>
    </div>
  );
}

function checkItemMetLocal(rank: AssigneeRank, label: string, scores: Record<string, number>, hasSteps: boolean): boolean {
  if (label === "依頼内容 5点")       return scores.task_content === 5;
  if (label === "依頼内容 4点以上")   return scores.task_content >= 4;
  if (label === "完了条件 5点")       return scores.completion_deliverable === 5;
  if (label === "完了条件 4点以上")   return scores.completion_deliverable >= 4;
  if (label === "完了条件 3点以上")   return scores.completion_deliverable >= 3;
  if (label === "制約 5点")           return scores.constraints_notes === 5;
  if (label === "制約 4点以上")       return scores.constraints_notes >= 4;
  if (label === "目的・背景 4点以上") return scores.purpose_background >= 4;
  if (label === "期限 3点以上")       return scores.deadline_clarity >= 3;
  if (label === "工数 3点以上")       return scores.workload_estimate >= 3;
  if (label === "手順3ステップ以上")  return hasSteps;
  return true;
}

// ============================================================
// Step 3: Preview (only reachable when passed)
// ============================================================
function StepPreview({
  draft, setDraft, evaluation, rankChanged, evaluatedRank, modeChanged, displayMode, finalText, manuallyEdited, regenLoading,
  onFinalTextChange, onRegenerate, onReEvaluate, onBack, onGo, loading,
}: {
  draft: InstructionDraft;
  setDraft: React.Dispatch<React.SetStateAction<InstructionDraft>>;
  evaluation: Evaluation;
  rankChanged: boolean;
  evaluatedRank: AssigneeRank | "";
  modeChanged: boolean;
  displayMode: SupportMode;
  finalText: string;
  manuallyEdited: boolean;
  regenLoading: boolean;
  loading: boolean;
  onFinalTextChange: (t: string) => void;
  onRegenerate: () => void;
  onReEvaluate: () => void;
  onBack: () => void;
  onGo: () => void;
}) {
  const ext = evaluation.structured_extraction;
  const rank = (draft.assignee_rank || "B") as AssigneeRank;

  const RankChangedNotice = (rankChanged || modeChanged) ? (
    <div className="rounded-sm border border-blue-300/60 bg-blue-50/50 px-5 py-4">
      <div className="text-sm font-medium text-blue-700">
        ℹ {rankChanged && modeChanged ? "担当者の指示レベルと支援モードが変更されました" : rankChanged ? "担当者の指示レベルが変更されました" : "支援モードが変更されました"}
      </div>
      <p className="mt-1 text-sm text-blue-700/80">
        {rankChanged && (
          <>この評価は指示レベル{evaluatedRank}基準のコメントです。現在の適用指示レベルは{rank}のため、
          合否判定・合格基準は指示レベル{rank}基準で再計算して表示しています。{modeChanged ? "" : "コメント内容や最終指示文も"}
          指示レベル{rank}に最適化するには「再評価する」を押してください。</>
        )}
        {modeChanged && (
          <>
            {rankChanged && " "}
            表示中のコメント・最終指示文は「{SUPPORT_MODE_LABELS[displayMode]}」モードで生成されたものです。
            現在選択中の「{SUPPORT_MODE_LABELS[draft.support_mode]}」モードの内容に切り替えるには「再評価する」を押してください。
          </>
        )}
      </p>
    </div>
  ) : null;

  // ── NOT PASSED: show gaps + comments + supplementary inputs + re-evaluate ──
  if (!evaluation.passed) {
    const failedComments = evaluation.comments.filter(
      (c) => c.score < (evaluation.scores[c.key as keyof typeof evaluation.scores] ?? 5),
    );
    // Comments for items that are below what's needed
    const lowComments = evaluation.comments.filter((c) => c.score < 4);

    return (
      <div className="space-y-5">
        {RankChangedNotice}
        {/* Header banner */}
        <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-destructive/10">
              <span className="font-serif text-lg font-semibold text-destructive">{evaluation.total}</span>
            </div>
            <div>
              <div className="font-medium text-destructive">
                合格基準未達 — 指示レベル{rank}基準 {evaluation.pass_threshold}/30点以上が必要です
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                最終指示文は合格基準を満たした後に生成されます。以下を確認して再評価してください。
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Left: gaps and required inputs */}
          <div className="space-y-4">
            {/* Missing mandatory criteria */}
            {!evaluation.mandatory_met && (
              <Card>
                <CardHeader eyebrow="不足項目" title="必須条件が未達です" />
                <div className="divide-y divide-border">
                  {getMandatoryLabel(rank).map((label) => {
                    const met = checkItemMetLocal(rank, label, evaluation.scores, evaluation.has_sequential_steps);
                    return (
                      <div key={label} className={`flex items-center gap-3 px-5 py-3 ${met ? "" : "bg-destructive/3"}`}>
                        <span className={`text-sm font-mono ${met ? "text-green-600" : "text-destructive"}`}>{met ? "✓" : "✗"}</span>
                        <span className={`text-sm ${met ? "text-muted-foreground" : "text-foreground font-medium"}`}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Consistency error */}
            {evaluation.consistency_error && (
              <div className="rounded-sm border border-destructive/50 bg-destructive/5 px-5 py-4">
                <div className="text-sm font-medium text-destructive">⚠ 工数・納期の矛盾</div>
                <p className="mt-1 text-sm text-destructive/80">{evaluation.consistency_error}</p>
              </div>
            )}

            {/* Supplementary input — all 6 dimensions covered */}
            <Card>
              <CardHeader eyebrow="補足入力" title="不足情報を補足してください"
                description="修正後「再評価する」を押してください。AIが6項目を再抽出・再評価します。" />
              <div className="space-y-4 p-5">
                {/* Overview — covers purpose_background, task_content, completion_deliverable */}
                <div>
                  <label className="text-xs font-medium text-foreground">
                    指示概要
                    <span className="ml-2 font-normal text-muted-foreground">
                      — 目的・背景 / 依頼内容 / 完了条件はここに追記してください
                    </span>
                  </label>
                  <textarea value={draft.overview}
                    onChange={(e) => setDraft((p) => ({ ...p, overview: e.target.value }))}
                    rows={6}
                    className="mt-1.5 w-full resize-none rounded-sm border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:border-foreground focus:outline-none" />
                </div>
                <div className="border-t border-border pt-4">
                  <div className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    任意項目（直接入力または概要から自動抽出）
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-foreground">期限</label>
                      <input type="text" value={draft.deadline}
                        onChange={(e) => setDraft((p) => ({ ...p, deadline: e.target.value }))}
                        placeholder="例：2026-06-10（水） 17:00"
                        className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground">見込み工数</label>
                      <input type="text" value={draft.estimated_hours}
                        onChange={(e) => setDraft((p) => ({ ...p, estimated_hours: e.target.value }))}
                        placeholder="例：3時間、半日、2日程度"
                        className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground">注意点・制約</label>
                      <textarea value={draft.constraints}
                        onChange={(e) => setDraft((p) => ({ ...p, constraints: e.target.value }))}
                        rows={2} placeholder="例：社外秘情報は除外 / テンプレv3使用 / 優先度：構成 > デザイン"
                        className="mt-1 w-full resize-none rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none" />
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <div className="flex gap-3">
              <button onClick={onReEvaluate} disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-sm bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40">
                {loading ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-background/40 border-t-background" />評価中…</> : "再評価する"}
              </button>
              <button onClick={onBack}
                className="rounded-sm border border-border px-5 py-3 text-sm text-muted-foreground hover:text-foreground">
                ← 評価に戻る
              </button>
            </div>
          </div>

          {/* Right: improvement comments */}
          <Card>
            <CardHeader eyebrow="改善コメント" title="修正が必要な項目"
              description="以下の点を指示概要に反映してから再評価してください。" />
            <div className="divide-y divide-border">
              {lowComments.length > 0 ? lowComments.map((c) => {
                const p = PERSPECTIVES.find((x) => x.key === c.key);
                return (
                  <div key={c.key} className="p-5">
                    <div className="flex items-center gap-3">
                      <ScoreBadge score={c.score} size="sm" />
                      <div>
                        <div className="text-sm font-medium">{p?.label ?? c.key}</div>
                        <div className="text-xs text-muted-foreground">{SCORE_LABELS[c.score]}</div>
                      </div>
                    </div>
                    <div className="mt-3 rounded-sm bg-muted/60 p-3 text-xs leading-relaxed">{c.reason}</div>
                    <div className="mt-2 rounded-sm border-l-2 border-accent bg-accent/5 p-3 text-xs leading-relaxed">{c.suggestion}</div>
                  </div>
                );
              }) : (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  スコアは基準に近づいています。必須条件を確認してください。
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ── PASSED: show final instruction ──
  return (
    <div className="space-y-4">
      {RankChangedNotice}
      {/* Passed banner */}
      <div className="rounded-sm border border-green-400/40 bg-green-50/50 px-5 py-3">
        <p className="text-sm font-medium text-green-700">
          ✓ 合格 — {evaluation.total}/30点（指示レベル{rank}基準 {evaluation.pass_threshold}点以上）。最終指示文を確認してGO確定してください。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left: structured data */}
        <Card>
          <CardHeader eyebrow="構造化データ（左）" title="6項目 確認" description="修正が必要な場合は「← 評価に戻る」から修正してください。" />
          <div className="divide-y divide-border">
            {[
              { key: "purpose_background",     label: "目的・背景",        val: ext?.purpose_background },
              { key: "task_content",            label: "依頼内容・作業内容", val: ext?.task_content },
              { key: "completion_deliverable",  label: "完了条件・成果物",   val: ext?.completion_deliverable },
              { key: "deadline_extracted",      label: "期限",              val: ext?.deadline_extracted },
              { key: "workload_extracted",      label: "見込み工数",         val: ext?.workload_extracted },
              { key: "constraints_extracted",   label: "注意点・制約",       val: ext?.constraints_extracted },
            ].map(({ key, label, val }) => (
              <div key={label} className="px-5 py-3">
                <div className="mb-0.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
                {val && val !== "（未記載）" ? (
                  key === "completion_deliverable" ? (
                    renderCompletionDeliverable(val)
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{val}</p>
                  )
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap"><span className="text-muted-foreground/40">（未記載）</span></p>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-border p-4">
            <button onClick={onBack} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">← 評価に戻る</button>
          </div>
        </Card>

        {/* Right: editable final instruction */}
        <Card>
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-4">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-accent">最終指示文（右）</div>
              <h2 className="mt-0.5 font-serif text-lg font-semibold">担当者への最終指示</h2>
              <p className="text-xs text-muted-foreground">指示レベル{draft.assignee_rank} · {SUPPORT_MODE_LABELS[draft.support_mode]}</p>
            </div>
            <button onClick={onRegenerate} disabled={regenLoading}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground disabled:opacity-40">
              {regenLoading
                ? <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />再生成中…</>
                : <>文章再作成{manuallyEdited && " ⚠"}</>}
            </button>
          </div>
          <div className="p-5">
            {manuallyEdited && <div className="mb-3 text-xs text-amber-600">⚠ 手動編集中。「文章再作成」で上書きされます。</div>}
            {regenLoading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground mr-2" />生成中…
              </div>
            ) : (
              <textarea value={finalText} onChange={(e) => onFinalTextChange(e.target.value)}
                rows={20}
                className="w-full resize-y rounded-sm border border-border bg-background px-4 py-3 font-sans text-sm leading-relaxed focus:border-foreground focus:outline-none" />
            )}
          </div>
          <div className="border-t border-border p-5">
            <button onClick={onGo}
              className="w-full rounded-sm bg-foreground py-3.5 text-sm font-semibold text-background hover:opacity-90">
              GO確定（指示を確定する）
            </button>
            <p className="mt-2 text-center text-xs text-muted-foreground">確定後はDBに保存されます。最終判断と責任は指示者が持ちます。</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Step 4: GO done
// ============================================================
function StepDone({ draft, evaluation, finalText, rawInput, copied, saveStatus, sheetsStatus, sheetsUrl, sheetsShareWarning, templates, onCopy, onReset, onTemplateSaved }: {
  draft: InstructionDraft;
  evaluation: Evaluation;
  finalText: string;
  rawInput: string;
  copied: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  sheetsStatus: "idle" | "saving" | "saved" | "error";
  sheetsUrl: string | null;
  sheetsShareWarning: string | null;
  templates: InstructionTemplate[];
  onCopy: () => void;
  onReset: () => void;
  onTemplateSaved: () => void;
}) {

  // 16-6: save this GO-confirmed instruction as a reusable template (up to 3 per instructor)
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateLabel, setTemplateLabel] = useState("");
  const [templateSlot, setTemplateSlot] = useState<1 | 2 | 3 | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);
  const takenSlots = templates.map((t) => t.slot);
  const nextFreeSlot = ([1, 2, 3] as const).find((s) => !takenSlots.includes(s)) ?? null;

  async function saveTemplate() {
    const slot = templateSlot ?? nextFreeSlot;
    if (!slot || !templateLabel.trim()) {
      setTemplateError("テンプレート名と保存先を選択してください");
      return;
    }
    setSavingTemplate(true);
    setTemplateError(null);
    try {
      const res = await fetch("/api/instruction-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot,
          label: templateLabel.trim(),
          overview: draft.overview,
          constraints: draft.constraints,
          tone: draft.tone,
          support_mode: draft.support_mode,
          importance: draft.importance,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "保存に失敗しました");
      }
      onTemplateSaved();
      setShowTemplateForm(false);
      setTemplateSaved(true);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSavingTemplate(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader eyebrow="Step 04 / Confirmed" title="確定指示文" description="この指示文を担当者に共有してください。" />
          <div className="p-6">
            <pre className="whitespace-pre-wrap rounded-sm border border-border bg-muted/40 p-5 font-sans text-sm leading-relaxed">{finalText}</pre>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={onCopy}
                className="inline-flex items-center gap-2 rounded-sm bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90">
                {copied ? "✓ コピーしました" : "テキストをコピー"}
              </button>
              <button onClick={onReset}
                className="rounded-sm border border-border bg-card px-5 py-3 text-sm text-foreground hover:bg-muted">
                新しい指示を作成
              </button>
            </div>
            {/* Google Sheets — auto-exported on GO */}
            <div className="mt-4 border-t border-border pt-4 flex items-center gap-3">
              {sheetsStatus === "saving" && (
                <span className="text-xs text-muted-foreground">Googleスプレッドシートへ出力中…</span>
              )}
              {sheetsStatus === "saved" && sheetsUrl && (
                <>
                  <span className="text-xs text-muted-foreground">✓ Googleスプレッドシートに自動出力済み</span>
                  <a href={sheetsUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                    シートを開く →
                  </a>
                </>
              )}
              {sheetsStatus === "error" && (
                <span className="text-xs text-destructive">Googleスプレッドシートへの出力に失敗しました（指示自体は保存済みです）</span>
              )}
            </div>
            {sheetsShareWarning && (
              <div className="mt-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                新規シートの自動作成に失敗しました（書き込み自体は成功しています）。管理者に連絡してください。詳細: {sheetsShareWarning}
              </div>
            )}

            {/* 16-6: save as reusable template */}
            <div className="mt-4 border-t border-border pt-4">
              {templateSaved ? (
                <div className="rounded-sm border border-green-200 bg-green-50 px-4 py-3 text-xs font-medium text-green-700">
                  ✓ テンプレートに保存しました。次回は Step 01「テンプレートから始める」から呼び出せます。
                </div>
              ) : !showTemplateForm ? (
                <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-muted/30 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">この指示をテンプレートとして保存しますか？</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">保存すると、次回以降に似た指示を作るとき、Step 01からワンクリックで呼び出せます（最大3件まで）。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowTemplateForm(true); setTemplateSlot(nextFreeSlot); setTemplateError(null); }}
                    className="shrink-0 rounded-sm border border-foreground bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-foreground hover:text-background"
                  >
                    テンプレートとして保存する
                  </button>
                </div>
              ) : (
                <div className="space-y-3 rounded-sm border border-accent/40 bg-card p-4">
                  {nextFreeSlot === null && (
                    <div>
                      <div className="mb-1.5 text-xs font-medium text-foreground">
                        すでに3件保存されています。置き換えるテンプレートを選んでください。
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {templates.map((t) => (
                          <button key={t.slot} type="button" onClick={() => setTemplateSlot(t.slot)}
                            className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                              templateSlot === t.slot ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:border-foreground/50"
                            }`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                      {/* 置き換え先の中身を見せた上で、意識的に置き換えを選んでもらう */}
                      {templateSlot && (
                        <div className="mt-3 rounded-sm border border-destructive/30 bg-destructive/5 p-3">
                          <p className="text-xs font-medium text-destructive">
                            ⚠「{templates.find((t) => t.slot === templateSlot)?.label}」を削除し、この内容に置き換えます。
                          </p>
                          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            （現在の内容）{templates.find((t) => t.slot === templateSlot)?.overview}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={templateLabel}
                      onChange={(e) => setTemplateLabel(e.target.value)}
                      placeholder="テンプレート名（例：月次報告の依頼）"
                      maxLength={30}
                      className="min-w-[220px] flex-1 rounded-sm border border-border bg-background px-3 py-1.5 text-sm focus:border-foreground focus:outline-none"
                    />
                    <button onClick={saveTemplate} disabled={savingTemplate}
                      className="rounded-sm bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40">
                      {savingTemplate ? "保存中…" : nextFreeSlot === null ? "置き換えて保存" : "保存"}
                    </button>
                    <button type="button" onClick={() => setShowTemplateForm(false)}
                      className="text-xs text-muted-foreground hover:text-foreground">
                      キャンセル
                    </button>
                  </div>
                  {templateError && <p className="text-xs text-destructive">{templateError}</p>}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
      <aside className="space-y-4">
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-accent">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />GO 済
            </div>
            <h3 className="mt-3 font-serif text-xl font-semibold">確定済み</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">本システムは内容の正確性を保証しません。確定した指示の責任は<strong className="text-foreground">指示者</strong>が持ちます。</p>
            <div className="mt-4 rounded-sm border border-border px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">DB保存状態</div>
              {saveStatus === "saving" && <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />保存中…</div>}
              {saveStatus === "saved" && <div className="mt-1.5 text-xs font-medium text-green-600">✓ 保存完了（3層データ）</div>}
              {saveStatus === "error" && <div className="mt-1.5 text-xs text-destructive">保存に失敗しました</div>}
            </div>
            <div className="mt-5 space-y-2 border-t border-border pt-4">
              {([
                ["合計スコア", `${evaluation.total}/30`],
                ["担当者の指示レベル", draft.assignee_rank || "—"],
                ["支援モード", SUPPORT_MODE_LABELS[draft.support_mode]],
                ...(evaluation.business_category ? [["業務分類", evaluation.business_category.sub_label]] : []),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <SidebarTip title="次のアクション" items={["担当者にテキストを共有", "生成AIへの入力にも活用可", "効果測定（確認回数・手戻り）"]} />
        {evaluation.milestones && evaluation.milestones.length > 0 && (
          <Card>
            <CardHeader eyebrow="進捗確認ポイント" title="マイルストーン" />
            <ul className="divide-y divide-border">
              {evaluation.milestones.map((m, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent">{i + 1}</span>
                  <span className="text-sm leading-relaxed">{m}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
