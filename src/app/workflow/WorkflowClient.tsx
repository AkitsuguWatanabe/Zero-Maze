"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClockIcon } from "lucide-react";
import { SiteFooter } from "@/components/SiteHeader";
import { useTeam } from "@/lib/team-context";
import { useAutosizeTextarea } from "@/hooks/useAutosizeTextarea";
import { PageHeader } from "@/components/PageHeader";
import { Card as UiCard } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { detectPii, redactPii, PII_KIND_LABEL, type PiiMatch } from "@/lib/pii-guard";
import { detectAmbiguousWords } from "@/lib/ambiguous-words";
import {
  RANK_LABELS,
  RANK_SELECTION_DISCLAIMER,
  SUPPORT_MODE_LABELS,
  SUPPORT_MODE_DESC,
  IMPORTANCE_LABELS,
  BUSINESS_CATEGORIES,
  URGENCY_LABELS,
  TONE_LABELS,
  mergeTeamCategories,
  composeOverview,
  computeRevealFlags,
  COMPOSED_DRAFT_STORAGE_KEY,
  type AssigneeRank,
  type SupportMode,
  type ImportanceLevel,
  type ToneType,
  type BusinessCategory,
  type InstructionDraft,
  type ComposeDraft,
  type Evaluation,
  type FeasibilityJudgment,
  type FeasibilityVerdictRecord,
  type MemberProfile,
  type TeamCategoryOverride,
  type InstructionTemplate,
  type ScoreKey,
} from "@/lib/mock-data";

type Categories = typeof BUSINESS_CATEGORIES;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  task_content: "",
  background: "",
  deadline: "",
  completion_deliverable: "",
  estimated_hours: "",
  urgency: "medium",
  constraints: "",
  assignee_name: "",
  tone: "peer",
  assignee_rank: "",
  support_mode: "efficiency",
  importance: "standard",
};

// AIの提案を自動反映できる欄。deadline_clarity（③期限）は日付ピッカーの
// ため対象外 — judgeFeasibilityは常にsuggested_addition=""を返す。
type ReflectableField = "task_content" | "background" | "completion_deliverable" | "estimated_hours" | "constraints";
const FIELD_FOR_KEY: Partial<Record<ScoreKey, ReflectableField>> = {
  purpose_background: "background",
  task_content: "task_content",
  completion_deliverable: "completion_deliverable",
  workload_estimate: "estimated_hours",
  constraints_notes: "constraints",
};

async function fetchClassifyCategory(
  draft: Pick<InstructionDraft, "task_content" | "background" | "importance">,
  teamId: string | null,
): Promise<BusinessCategory> {
  const res = await fetch("/api/classify-category", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task_content: draft.task_content,
      background: draft.background,
      team_id: teamId || null,
      importance: draft.importance,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "業務分類の判定に失敗しました");
  return (data as { business_category: BusinessCategory }).business_category;
}

async function fetchFeasibility(
  draft: InstructionDraft,
  rank: AssigneeRank,
): Promise<FeasibilityJudgment> {
  const res = await fetch("/api/feasibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task_content: draft.task_content,
      background: draft.background,
      deadline: draft.deadline,
      estimated_hours: draft.estimated_hours || undefined,
      completion_deliverable: draft.completion_deliverable || undefined,
      constraints: draft.constraints || undefined,
      assignee_rank: rank,
      support_mode: draft.support_mode,
      importance: draft.importance,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error("確認がタイムアウトしました。もう一度お試しください。（評価精度を「通常」に切り替えると速くなります）");
    }
    throw new Error((data as { error?: string }).error ?? "確認に失敗しました");
  }
  return data as FeasibilityJudgment;
}

async function fetchEvaluation(draft: InstructionDraft, teamId: string | null): Promise<Evaluation> {
  const res = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft, assignee_rank: draft.assignee_rank, support_mode: draft.support_mode, team_id: teamId || null }),
  });
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error("作成がタイムアウトしました。もう一度お試しください。（評価精度を「通常」に切り替えると速くなります）");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `作成に失敗しました (${res.status})`);
  }
  return res.json() as Promise<Evaluation>;
}

async function fetchFinalize(
  draft: InstructionDraft,
  teamId: string | null,
  structuredExtraction: Evaluation["structured_extraction"] | undefined,
): Promise<{ final_instruction: string; milestones: string[] | null }> {
  const res = await fetch("/api/evaluate/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draft,
      assignee_rank: draft.assignee_rank,
      support_mode: draft.support_mode,
      team_id: teamId || null,
      structured_extraction: structuredExtraction,
    }),
  });
  if (!res.ok) {
    if (res.status === 504) {
      throw new Error("完成指示の生成がタイムアウトしました。もう一度お試しください。");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `完成指示の生成に失敗しました (${res.status})`);
  }
  return res.json() as Promise<{ final_instruction: string; milestones: string[] | null }>;
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

function ReflectedHint({ severity }: { severity: "caution" | "risk" }) {
  return severity === "risk" ? (
    <p className="text-sm text-red-700">🔴 赤字はAIが自動反映した内容です（特に確認しておきたい点があります）。編集すると通常の色に戻ります。</p>
  ) : (
    <p className="text-sm text-blue-700">💡 青字はAIが自動反映した内容です。編集すると通常の色に戻ります。</p>
  );
}

function AmbiguousWordHint({ text }: { text: string }) {
  const matches = detectAmbiguousWords(text);
  if (matches.length === 0) return null;
  return (
    <p className="text-sm text-warning-foreground">
      💡「{matches.map((m) => m.text).join("」「")}」のような曖昧な表現があります。具体的に書けるとより伝わりやすくなります（このままでも送信できます）。
    </p>
  );
}

// このコンポーネントから引き継いだ①作業概要の下書きを読み取って消費する。
function readComposedHandoff(): InstructionDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(COMPOSED_DRAFT_STORAGE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(COMPOSED_DRAFT_STORAGE_KEY);
  try {
    const composed = JSON.parse(raw) as ComposeDraft;
    const taskContent = composed.task_content ?? "";
    return { ...EMPTY_DRAFT, task_content: taskContent, overview: composeOverview(taskContent, "") };
  } catch {
    return null;
  }
}

export default function WorkflowClient() {
  const { selectedTeamId } = useTeam();
  const [draft, setDraft] = useState<InstructionDraft>(EMPTY_DRAFT);
  const [mounted, setMounted] = useState(false);
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [templates, setTemplates] = useState<InstructionTemplate[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Categories>(BUSINESS_CATEGORIES);

  const [overviewTouched, setOverviewTouched] = useState(false);
  const [piiConfirm, setPiiConfirm] = useState<PiiMatch[] | null>(null);
  const [pendingAction, setPendingAction] = useState<"check" | "create" | null>(null);

  const [businessCategory, setBusinessCategory] = useState<BusinessCategory | null>(null);
  const [feasibility, setFeasibility] = useState<FeasibilityJudgment | null>(null);
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [revealedByComment, setRevealedByComment] = useState<Partial<Record<ReflectableField, true>>>({});
  const [reflectedFields, setReflectedFields] = useState<
    Partial<Record<ReflectableField, { value: string; severity: "caution" | "risk"; suggestion: string }>>
  >({});
  const [classifying, setClassifying] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  // 作成済みの内部評価一式（数値スコアはUIには一切出さないが、
  // /api/instructionsの保存・Google Sheets出力には引き続き必要なため保持する）
  const [evaluationForSave, setEvaluationForSave] = useState<Evaluation | null>(null);
  const [finalText, setFinalText] = useState("");
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [showRegenDialog, setShowRegenDialog] = useState(false);
  const [showRiskGoDialog, setShowRiskGoDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [initialOverview, setInitialOverview] = useState("");

  const [goConfirmed, setGoConfirmed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sheetsStatus, setSheetsStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sheetsUrl, setSheetsUrl] = useState<string | null>(null);
  const [sheetsShareWarning, setSheetsShareWarning] = useState<string | null>(null);
  const [feedbackToken, setFeedbackToken] = useState<string | null>(null);
  const [assigneeEmailDefault, setAssigneeEmailDefault] = useState("");

  const inFlightRef = useRef(false);
  // ①②③の編集・リセットで陳腐化した非同期リクエストの結果を無視するための世代カウンタ。
  // inFlightRefは「新しいリクエストの二重発火」は防げるが、「リクエスト中に入力内容が
  // 変わった後、古いリクエストの結果が遅れて返ってきて新しい内容を上書きする」ことは
  // 防げない（実機確認で発見：確認処理中に別の指示へ切り替えると、古い指示の判定結果が
  // 後から反映されてしまう不具合）。
  const requestIdRef = useRef(0);
  // ①②に自動反映されたAI追記文を、reflectedFieldsとは別に覚えておくための記録。
  // 「この内容を修正してもう一度作成する」で戻った直後はresetDownstream()が
  // reflectedFieldsを消してしまうため、reflectedFields頼みだと戻った後の編集で
  // 追記文を検知できなくなる。この記録は表示用の状態とは独立して残り続けるため、
  // 戻った後に①②の一部だけを書き換えても、末尾に残ったAI追記文を検知して
  // 取り除ける。
  const appliedSuggestionRef = useRef<Partial<Record<"task_content" | "background", string>>>({});

  const effectiveTeamId = myRole === "team_leader" ? myTeamId : selectedTeamId;

  useEffect(() => {
    // /workflow/composeから引き継いだ下書きがあれば最優先で読み込む
    const handoff = readComposedHandoff();
    if (handoff) setDraft(handoff);
    setMounted(true);
  }, []);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { role?: string; teamId?: string | null }) => {
        setMyRole(d.role ?? null);
        setMyTeamId(d.teamId ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!effectiveTeamId) { setCategories(BUSINESS_CATEGORIES); return; }
    fetch(`/api/team-categories?teamId=${effectiveTeamId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: TeamCategoryOverride[]) => setCategories(mergeTeamCategories(Array.isArray(d) ? d : [])))
      .catch(() => setCategories(BUSINESS_CATEGORIES));
  }, [effectiveTeamId]);

  useEffect(() => {
    const url = effectiveTeamId ? `/api/members?teamId=${effectiveTeamId}` : "/api/members";
    fetch(url)
      .then((r) => r.json())
      .then((d) => setMembers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [effectiveTeamId]);

  function fetchTemplates() {
    fetch("/api/instruction-templates")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: InstructionTemplate[]) => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => {});
  }
  useEffect(() => { fetchTemplates(); }, []);

  function isReflected(field: ReflectableField): boolean {
    return reflectedFields[field] !== undefined && reflectedFields[field]!.value === draft[field];
  }
  function reflectedSeverity(field: ReflectableField): "caution" | "risk" | null {
    return isReflected(field) ? reflectedFields[field]!.severity : null;
  }
  // このアプリの意味的トークン（text-destructive/text-info-foreground）は、
  // 通常の本文色（--foreground）と同系統の低彩度な色で、テキストエリアの
  // 地の文と並べると視覚的にほぼ見分けがつかなかった（実機確認で判明）。
  // 移植元と同じ、はっきり区別できるTailwind標準色に固定する。
  function reflectedTextClass(field: ReflectableField): string {
    const severity = reflectedSeverity(field);
    return severity === "risk" ? "text-red-700" : severity === "caution" ? "text-blue-700" : "text-foreground";
  }

  function emptyContentNote(key: "task_content" | "purpose_background" | "completion_deliverable" | "workload_estimate" | "constraints_notes"): string | null {
    if (!feasibility) return null;
    const item = feasibility.missing_perspectives.find((m) => m.key === key && m.suggested_addition === "");
    return item ? item.note : null;
  }

  // 育成重視モードでは自動反映しない代わりに、AIが返す誘導質問
  // （suggested_addition、末尾「？」）をこの欄に表示する。efficiency用の
  // emptyContentNoteはsuggested_addition===""の項目しか拾わないため、
  // 常に空文字が入るdeadline_clarity以外の育成重視の質問はこれまで
  // どの画面にも表示されていなかった（実機確認で発見）。
  function coachingQuestion(key: "task_content" | "purpose_background" | "completion_deliverable" | "workload_estimate" | "constraints_notes"): string | null {
    if (!feasibility || draft.support_mode !== "coaching") return null;
    const item = feasibility.missing_perspectives.find((m) => m.key === key && m.suggested_addition !== "");
    return item ? item.suggested_addition : null;
  }

  const reveal = feasibility ? computeRevealFlags(feasibility) : null;
  const showCompletionField = showMoreFields || !!reveal?.completion_deliverable || !!revealedByComment.completion_deliverable || !!draft.completion_deliverable.trim();
  const showEstimatedHoursField = showMoreFields || !!reveal?.estimated_hours || !!revealedByComment.estimated_hours || !!draft.estimated_hours.trim();
  const showConstraintsField = showMoreFields || !!reveal?.constraints || !!revealedByComment.constraints || !!draft.constraints.trim();

  function draftText(): string {
    return [draft.task_content, draft.background, draft.completion_deliverable, draft.estimated_hours, draft.constraints]
      .filter(Boolean)
      .join("\n");
  }

  function resetDownstream() {
    requestIdRef.current += 1;
    setFeasibility(null);
    setBusinessCategory(null);
    setRevealedByComment({});
    setReflectedFields({});
    setEvaluationForSave(null);
    setFinalText("");
    setManuallyEdited(false);
    setGoConfirmed(false);
  }

  // ①②③を変更する前に、④⑤⑥のうち「AIの提案のまま未編集」の欄をクリアする。
  // クリアしないと、前回の①②③に対する古いAI提案が新しい①②③の後ろに
  // そのまま残り、再確認時にその古い内容へさらに追記されてしまう
  // （実機確認で発見：指示を修正すると前回の指示が一部残る不具合）。
  // ユーザー自身が手を加えた内容（isReflectedがfalse）はそのまま残す。
  function clearStaleAiFields(base: InstructionDraft): InstructionDraft {
    const next = { ...base };
    (["completion_deliverable", "estimated_hours", "constraints"] as ReflectableField[]).forEach((field) => {
      if (isReflected(field)) next[field] = "";
    });
    // ①②はユーザー自身の文章にAIの追記文が連結されているため、④⑤⑥のように
    // 欄ごと消すことはできない。ユーザーが文頭側だけを書き換え、末尾に残った
    // AI追記文にそのまま気づかなかった場合、古い追記内容が新しい入力と矛盾した
    // まま次の確認に送信されてしまう（実機確認で発見：例「見積書」を「請求書」に
    // 書き換えたが、AIが追記した「見積書には…」の一文だけが末尾に残っていた）。
    // 追記文がまだ末尾にそのまま残っている場合に限り、その部分だけを取り除く。
    (["task_content", "background"] as const).forEach((field) => {
      const suggestion = appliedSuggestionRef.current[field];
      if (!suggestion) return;
      const suffix = `\n${suggestion}`;
      if (next[field].endsWith(suffix)) {
        next[field] = next[field].slice(0, -suffix.length);
        delete appliedSuggestionRef.current[field];
      }
    });
    return next;
  }

  function updateTaskContent(v: string) {
    setDraft((prev) => clearStaleAiFields({ ...prev, task_content: v, overview: composeOverview(v, prev.background) }));
    resetDownstream();
  }
  function updateBackground(v: string) {
    setDraft((prev) => clearStaleAiFields({ ...prev, background: v, overview: composeOverview(prev.task_content, v) }));
    resetDownstream();
  }
  function updateDeadline(v: string) {
    setDraft((prev) => clearStaleAiFields({ ...prev, deadline: v }));
    resetDownstream();
  }

  // 業務分類が確定した時点で、その担当者のプロフィールからランクを自動導出する。
  function deriveRankForCategory(cat: BusinessCategory): AssigneeRank {
    const member = members.find((m) => m.name === draft.assignee_name || m.email === draft.assignee_name);
    const derived = member?.profile[cat.sub];
    return (derived as AssigneeRank | undefined) || "B";
  }

  // 効率重視モードに限り、足りない観点の提案文を対応欄の末尾へ自動で追記する。
  function autoApplySuggestions(judgment: FeasibilityJudgment, base: InstructionDraft) {
    if (base.support_mode !== "efficiency") return;
    const severity: "caution" | "risk" =
      judgment.can_execute_correctly === "risk" || judgment.can_meet_deadline === "risk" ? "risk" : "caution";
    const applied: Partial<Record<ReflectableField, { value: string; severity: "caution" | "risk"; suggestion: string }>> = {};
    const next: InstructionDraft = { ...base };
    for (const m of judgment.missing_perspectives) {
      if (!m.suggested_addition) continue;
      const field = FIELD_FOR_KEY[m.key];
      if (!field) continue;
      const current = next[field];
      if (current.includes(m.suggested_addition)) continue;
      const combined = current ? `${current}\n${m.suggested_addition}` : m.suggested_addition;
      next[field] = combined;
      applied[field] = { value: combined, severity, suggestion: m.suggested_addition };
      if (field === "task_content" || field === "background") {
        appliedSuggestionRef.current[field] = m.suggested_addition;
      }
    }
    if (Object.keys(applied).length === 0) return;
    if (applied.task_content !== undefined || applied.background !== undefined) {
      next.overview = composeOverview(next.task_content, next.background);
    }
    setDraft(next);
    setRevealedByComment((prev) => {
      const nextRevealed: Partial<Record<ReflectableField, true>> = { ...prev };
      for (const field of Object.keys(applied) as ReflectableField[]) nextRevealed[field] = true;
      return nextRevealed;
    });
    setReflectedFields((prev) => ({ ...prev, ...applied }));
  }

  async function handleCheckFeasibility(opts?: { skipPiiCheck?: boolean }) {
    setOverviewTouched(true);
    if (classifying || creating) return;
    if (!draft.task_content.trim()) { setCheckError("①作業概要を入力してください。"); return; }
    if (!draft.background.trim()) { setCheckError("②背景を入力してください。"); return; }
    if (!draft.deadline) { setCheckError("③期限を選択してください。"); return; }
    if (inFlightRef.current) return;
    if (!opts?.skipPiiCheck) {
      const matches = detectPii(draftText());
      if (matches.length > 0) {
        setPendingAction("check");
        setPiiConfirm(matches);
        return;
      }
    }
    inFlightRef.current = true;
    setPiiConfirm(null);
    setPendingAction(null);
    setClassifying(true);
    setCheckError(null);
    const myRequestId = ++requestIdRef.current;
    try {
      const category = await fetchClassifyCategory(draft, effectiveTeamId);
      const rank = deriveRankForCategory(category);
      const draftWithRank: InstructionDraft = { ...draft, assignee_rank: rank };
      const judgment = await fetchFeasibility(draftWithRank, rank);
      // この間に①②③が編集・リセットされていたら、この結果はもう古い内容に対する
      // ものなので画面には反映しない（陳腐化した結果での上書きを防ぐ）。
      if (requestIdRef.current !== myRequestId) return;
      setBusinessCategory(category);
      setDraft(draftWithRank);
      setFeasibility(judgment);
      autoApplySuggestions(judgment, draftWithRank);
    } catch (e) {
      if (requestIdRef.current === myRequestId) setCheckError(e instanceof Error ? e.message : "確認に失敗しました");
    } finally {
      inFlightRef.current = false;
      setClassifying(false);
    }
  }

  // 業務分類をユーザーが手動で修正した場合、その分類でランクを再導出する
  // （AI確認のやり直しは強制しない — 必要ならユーザーが「この内容を確認する」を再度押す）。
  function handleCategoryOverride(cat: BusinessCategory) {
    setBusinessCategory(cat);
    const rank = deriveRankForCategory(cat);
    setDraft((prev) => ({ ...prev, assignee_rank: rank }));
  }

  async function handleCreate(opts?: { skipPiiCheck?: boolean }) {
    if (classifying || creating) return;
    if (inFlightRef.current) return;
    if (!opts?.skipPiiCheck) {
      const matches = detectPii(draftText());
      if (matches.length > 0) {
        setPendingAction("create");
        setPiiConfirm(matches);
        return;
      }
    }
    inFlightRef.current = true;
    setPiiConfirm(null);
    setPendingAction(null);
    setCreating(true);
    setCreateError(null);
    setInitialOverview((prev) => prev || draft.overview);
    const myRequestId = ++requestIdRef.current;
    try {
      const result = await fetchEvaluation(draft, effectiveTeamId);
      // 業務分類はextractStructured自体はもう返さない（確認ステップの
      // classifyBusinessCategory()がすでに確定させた値を使う設計のため）。
      // 確認時にユーザーへ見せた分類・ランクとDB保存内容がズレないよう、
      // ここで明示的にセットする。
      result.business_category = businessCategory ?? null;
      const final = await fetchFinalize(draft, effectiveTeamId, result.structured_extraction);
      result.final_instruction = final.final_instruction;
      result.milestones = final.milestones;
      // この間に①②③が編集・リセットされていたら、この結果はもう古い内容に対する
      // ものなので画面には反映しない（陳腐化した結果での上書きを防ぐ）。
      if (requestIdRef.current !== myRequestId) return;
      setEvaluationForSave(result);
      setFinalText(final.final_instruction);
      setManuallyEdited(false);
    } catch (e) {
      if (requestIdRef.current === myRequestId) setCreateError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      inFlightRef.current = false;
      setCreating(false);
    }
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
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "再生成に失敗しました。");
    } finally {
      setRegenLoading(false);
    }
  }

  function handlePiiReplace() {
    if (!piiConfirm) return;
    setDraft((prev) => {
      const nextTaskContent = redactPii(prev.task_content, piiConfirm);
      const nextBackground = redactPii(prev.background, piiConfirm);
      return {
        ...prev,
        task_content: nextTaskContent,
        background: nextBackground,
        overview: composeOverview(nextTaskContent, nextBackground),
        completion_deliverable: redactPii(prev.completion_deliverable, piiConfirm),
        estimated_hours: redactPii(prev.estimated_hours, piiConfirm),
        constraints: redactPii(prev.constraints, piiConfirm),
      };
    });
    setPiiConfirm(null);
    setPendingAction(null);
  }
  function handlePiiSendAsIs() {
    const action = pendingAction;
    setPiiConfirm(null);
    setPendingAction(null);
    if (action === "create") handleCreate({ skipPiiCheck: true });
    else handleCheckFeasibility({ skipPiiCheck: true });
  }
  function handlePiiCancel() {
    setPiiConfirm(null);
    setPendingAction(null);
  }

  // AIが「実行可否」「期限遵守」のいずれかを×（risk）と判定した状態のまま
  // 確定しようとした場合、確定前に一段階の警告を挟む（実機確認で議論になった
  // 論点：×判定でもシステム上ブロックせず確定できてしまっていたため）。
  // 合否のような強制ブロックではなく、最終判断はあくまで指示者に残す —
  // 警告を見た上で「このまま確定する」を選べば進める。
  const hasRiskVerdict =
    feasibility?.can_execute_correctly === "risk" || feasibility?.can_meet_deadline === "risk";

  function requestGo() {
    if (hasRiskVerdict) { setShowRiskGoDialog(true); return; }
    handleGo(false);
  }

  function handleGo(riskAcknowledged: boolean) {
    if (!evaluationForSave) return;
    setShowRiskGoDialog(false);
    setGoConfirmed(true);
    setSaveStatus("saving");
    setFeedbackToken(null);
    const assignedMember = members.find((m) => m.name === draft.assignee_name || m.email === draft.assignee_name);
    setAssigneeEmailDefault(assignedMember?.email ?? "");
    // GO確定前の最後の確認結果（feasibility）を質的判定としてDBへ保存する。
    // ①②③を編集するたびにresetDownstream()でクリアされる設計のため、この
    // 時点のfeasibilityは必ず今回のdraftに対応した最新の内容になっている。
    const feasibilityRecord: FeasibilityVerdictRecord | null = feasibility
      ? {
          can_execute_verdict: feasibility.can_execute_correctly,
          can_execute_reason: feasibility.can_execute_reason,
          can_meet_deadline_verdict: feasibility.can_meet_deadline,
          can_meet_deadline_reason: feasibility.can_meet_deadline_reason,
          missing_perspective_keys: feasibility.missing_perspectives.map((m) => m.key),
        }
      : null;
    const body = JSON.stringify({
      draft,
      evaluation: evaluationForSave,
      feasibility: feasibilityRecord,
      risk_acknowledged: riskAcknowledged,
      raw_input: initialOverview || draft.overview,
      final_text: finalText,
      business_category: businessCategory,
      team_id: effectiveTeamId || null,
      assignee_id: assignedMember?.id ?? null,
    });
    fetch("/api/instructions", { method: "POST", headers: { "Content-Type": "application/json" }, body })
      .then(async (r) => {
        if (!r.ok) { setSaveStatus("error"); return; }
        const data = await r.json().catch(() => ({}));
        setFeedbackToken((data as { feedback_token?: string | null }).feedback_token ?? null);
        setSaveStatus("saved");
      })
      .catch(() => setSaveStatus("error"));
    setSheetsStatus("saving");
    fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft,
        evaluation: evaluationForSave,
        feasibility: feasibilityRecord,
        riskAcknowledged,
        rawInput: initialOverview || draft.overview,
        finalText,
      }),
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

  function handleNewInstruction() {
    setDraft(EMPTY_DRAFT);
    setOverviewTouched(false);
    appliedSuggestionRef.current = {};
    resetDownstream();
    setCheckError(null);
    setCreateError(null);
    setCopied(false);
    setSaveStatus("idle");
    setSheetsStatus("idle");
    setSheetsUrl(null);
    setSheetsShareWarning(null);
    setFeedbackToken(null);
    setInitialOverview("");
    setShowMoreFields(false);
  }

  if (!mounted) {
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
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">← ホームに戻る</Link>

        <div className="mt-4 mb-8">
          <PageHeader eyebrow="指示作成" title="その指示、AIが仕上げます。"
            description="①作業概要・②背景・③期限を入力するだけで、AIが不足を補い、伝わる指示に仕上げます。" />
        </div>

        {(checkError || createError) && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-sm border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            <span>{checkError || createError}</span>
            <button onClick={() => { setCheckError(null); setCreateError(null); }} className="shrink-0 text-xs underline-offset-4 hover:underline">閉じる</button>
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

        <Dialog open={showRiskGoDialog} onOpenChange={setShowRiskGoDialog}>
          <DialogContent className="max-w-sm">
            <DialogTitle className="sr-only">確定前の確認</DialogTitle>
            <DialogDescription className="text-base font-bold text-destructive">
              この指示内容では、相手に「伝わらない」と考えますが、このまま確定してもよろしいですか？
            </DialogDescription>
            <div className="mt-1 flex gap-3">
              <Button className="flex-1" variant="outline" onClick={() => setShowRiskGoDialog(false)}>戻って修正する</Button>
              <Button className="flex-1" onClick={() => handleGo(true)}>このまま確定する</Button>
            </div>
          </DialogContent>
        </Dialog>

        {piiConfirm && (
          <div className="mb-6 space-y-3 rounded-sm border-2 border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-destructive">⚠ 個人情報・社名らしき表記が見つかりました</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-destructive/90">
              {piiConfirm.map((m, i) => (
                <li key={i}>{PII_KIND_LABEL[m.kind]}：「{m.text}」</li>
              ))}
            </ul>
            <p className="text-sm text-destructive/80">入力内容はAI（OpenAI）に送信されます。「A社」のような一般的な表記に置き換えることをおすすめします。</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={handlePiiReplace} className="flex-1 rounded-sm bg-foreground px-3 py-2.5 text-sm font-semibold text-background hover:opacity-90">一般的な表記に置き換える</button>
              <button type="button" onClick={handlePiiSendAsIs} className="flex-1 rounded-sm border border-destructive/40 bg-background px-3 py-2.5 text-sm font-semibold text-destructive hover:border-destructive">このまま送信する</button>
              <button type="button" onClick={handlePiiCancel} className="flex-1 rounded-sm border border-border bg-background px-3 py-2.5 text-sm font-semibold hover:border-foreground/50">キャンセルして編集する</button>
            </div>
          </div>
        )}

        {!evaluationForSave && (
          <StepInput
            draft={draft}
            setDraft={setDraft}
            members={members}
            templates={templates}
            businessCategory={businessCategory}
            categories={categories}
            feasibility={feasibility}
            classifying={classifying}
            creating={creating}
            overviewTouched={overviewTouched}
            showCompletionField={showCompletionField}
            showEstimatedHoursField={showEstimatedHoursField}
            showConstraintsField={showConstraintsField}
            showMoreFields={showMoreFields}
            setShowMoreFields={setShowMoreFields}
            reflectedTextClass={reflectedTextClass}
            reflectedSeverity={reflectedSeverity}
            emptyContentNote={emptyContentNote}
            coachingQuestion={coachingQuestion}
            onTaskContentChange={updateTaskContent}
            onBackgroundChange={updateBackground}
            onDeadlineChange={updateDeadline}
            onCategoryOverride={handleCategoryOverride}
            onCheck={() => handleCheckFeasibility()}
            onCreate={() => handleCreate()}
            onTemplateDeleted={fetchTemplates}
            onNewInstruction={handleNewInstruction}
            onApplyTemplate={(t) => {
              // テンプレート保存時のoverviewは①作業概要相当の一文なので、
              // ①作業概要欄へ読み込む（②背景はテンプレートに保存されておらず、
              // 案件ごとに異なるはずのためユーザーに都度入力してもらう）。
              setDraft((prev) => ({
                ...prev,
                task_content: t.overview,
                overview: composeOverview(t.overview, prev.background),
                constraints: t.constraints,
                tone: t.tone,
                support_mode: t.support_mode,
                importance: t.importance,
              }));
              resetDownstream();
            }}
          />
        )}

        {evaluationForSave && !goConfirmed && (
          <StepResult
            draft={draft}
            finalText={finalText}
            manuallyEdited={manuallyEdited}
            regenLoading={regenLoading}
            onFinalTextChange={(t) => { setFinalText(t); setManuallyEdited(true); }}
            onRegenerate={handleRegenerate}
            onBackToEdit={resetDownstream}
            onGo={requestGo}
          />
        )}

        {evaluationForSave && goConfirmed && (
          <StepDone
            draft={draft}
            evaluation={evaluationForSave!}
            businessCategory={businessCategory}
            finalText={finalText}
            copied={copied}
            saveStatus={saveStatus}
            sheetsStatus={sheetsStatus}
            sheetsUrl={sheetsUrl}
            sheetsShareWarning={sheetsShareWarning}
            templates={templates}
            feedbackToken={feedbackToken}
            assigneeEmailDefault={assigneeEmailDefault}
            onCopy={() => { navigator.clipboard?.writeText(finalText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            onReset={handleNewInstruction}
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
// Input + confirm（記入誘導型 — ①②③入力から④⑤⑥の段階的展開まで一体）
// ============================================================
function StepInput({
  draft, setDraft, members, templates, businessCategory, categories, feasibility, classifying, creating, overviewTouched,
  showCompletionField, showEstimatedHoursField, showConstraintsField, showMoreFields, setShowMoreFields,
  reflectedTextClass, reflectedSeverity, emptyContentNote, coachingQuestion,
  onTaskContentChange, onBackgroundChange, onDeadlineChange, onCategoryOverride, onCheck, onCreate, onTemplateDeleted, onApplyTemplate, onNewInstruction,
}: {
  draft: InstructionDraft;
  setDraft: React.Dispatch<React.SetStateAction<InstructionDraft>>;
  members: MemberProfile[];
  templates: InstructionTemplate[];
  businessCategory: BusinessCategory | null;
  categories: Categories;
  feasibility: FeasibilityJudgment | null;
  classifying: boolean;
  creating: boolean;
  overviewTouched: boolean;
  showCompletionField: boolean;
  showEstimatedHoursField: boolean;
  showConstraintsField: boolean;
  showMoreFields: boolean;
  setShowMoreFields: (v: boolean) => void;
  reflectedTextClass: (field: ReflectableField) => string;
  reflectedSeverity: (field: ReflectableField) => "caution" | "risk" | null;
  emptyContentNote: (key: "task_content" | "purpose_background" | "completion_deliverable" | "workload_estimate" | "constraints_notes") => string | null;
  coachingQuestion: (key: "task_content" | "purpose_background" | "completion_deliverable" | "workload_estimate" | "constraints_notes") => string | null;
  onTaskContentChange: (v: string) => void;
  onBackgroundChange: (v: string) => void;
  onDeadlineChange: (v: string) => void;
  onCategoryOverride: (cat: BusinessCategory) => void;
  onCheck: () => void;
  onCreate: () => void;
  onTemplateDeleted: () => void;
  onApplyTemplate: (t: InstructionTemplate) => void;
  onNewInstruction: () => void;
}) {
  const [previewTemplate, setPreviewTemplate] = useState<InstructionTemplate | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [newConfirm, setNewConfirm] = useState(false);

  const hasTaskError = overviewTouched && !draft.task_content.trim();

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
      onTemplateDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setDeletingTemplate(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Settings strip */}
      <div className="rounded-sm border border-border bg-card shadow-paper">
        <div className="flex flex-wrap gap-px divide-x divide-border">
          <div className="flex-1 min-w-[200px] px-5 py-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">担当者</div>
            {members.length > 0 ? (
              <select value={draft.assignee_name} onChange={(e) => setDraft((prev) => ({ ...prev, assignee_name: e.target.value }))}
                className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-sm focus:border-foreground focus:outline-none">
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
          </div>
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
            <div className="mt-1 max-w-[220px] text-sm text-muted-foreground">{SUPPORT_MODE_DESC[draft.support_mode]}</div>
          </div>
          <div className="shrink-0 px-5 py-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">評価精度</div>
            <div className="flex gap-1.5">
              {(["standard", "high"] as ImportanceLevel[]).map((lvl) => (
                <button key={lvl} type="button" onClick={() => setDraft((prev) => ({ ...prev, importance: lvl }))}
                  className={`rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors ${
                    draft.importance === lvl
                      ? lvl === "high" ? "border-warning bg-warning text-warning-foreground" : "border-foreground bg-foreground text-background"
                      : "border-border bg-background hover:border-foreground/50"
                  }`}>
                  {IMPORTANCE_LABELS[lvl].label}
                </button>
              ))}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{IMPORTANCE_LABELS[draft.importance ?? "standard"].desc}</div>
          </div>
          <div className="shrink-0 px-5 py-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">緊急度</div>
            <div className="flex gap-1.5">
              {(["high", "medium", "low"] as const).map((u) => (
                <button key={u} type="button" onClick={() => setDraft((prev) => ({ ...prev, urgency: u }))}
                  className={`rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors ${
                    draft.urgency === u ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/50"
                  }`}>
                  {URGENCY_LABELS[u].label}
                </button>
              ))}
            </div>
          </div>
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

      <Card>
        <CardHeader eyebrow="Instruction" title="①作業概要・②背景・③期限を入力する"
          description="AIが必要な指示内容を自動で補います。" />
        <div className="space-y-5 p-5">
          <div className="flex items-center justify-end">
            {!newConfirm ? (
              <button type="button" onClick={() => setNewConfirm(true)}
                className="text-xs text-muted-foreground hover:text-destructive">
                入力内容をクリアして新しい指示を作成する
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs">
                <span className="font-medium text-destructive">入力中の内容は消えます。よろしいですか？</span>
                <button type="button" onClick={() => { setNewConfirm(false); onNewInstruction(); }}
                  className="rounded-sm bg-destructive px-2.5 py-1 font-medium text-white hover:opacity-90">
                  クリアする
                </button>
                <button type="button" onClick={() => setNewConfirm(false)} className="text-muted-foreground hover:text-foreground">
                  キャンセル
                </button>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-sm border-2 border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">
            <span className="mt-px shrink-0">🚫</span>
            <span>社名・氏名・メールアドレス・電話番号などの個人情報は入力しないでください。それらしき表記があれば、送信前に確認画面が表示されます。入力内容はAI（OpenAI）に送信されます。</span>
          </div>

          <Link href={`/workflow/compose?rank=${draft.assignee_rank || "B"}`}
            className="flex items-center justify-between gap-3 rounded-sm border border-accent/40 bg-accent/5 px-4 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent/10">
            <span>💬 ①作業概要をうまく言葉にできない場合は、AIと相談しながら作成する</span>
            <span aria-hidden="true" className="shrink-0 text-base">→</span>
          </Link>

          {templates.length > 0 && (
            <div className="rounded-sm border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-foreground">テンプレートから始める：</span>
                {templates.map((t) => (
                  <div key={t.id} className="inline-flex items-center overflow-hidden rounded-sm border border-border">
                    <button type="button" onClick={() => { setPreviewTemplate(t); setDeleteConfirmId(null); }}
                      className={`px-2.5 py-1 text-xs transition-colors ${previewTemplate?.id === t.id ? "bg-foreground text-background" : "bg-background text-foreground hover:bg-muted"}`}>
                      {t.label}
                    </button>
                    <button type="button" onClick={() => { setDeleteConfirmId(t.id); setDeleteError(null); setPreviewTemplate(null); }}
                      title={`「${t.label}」を削除`}
                      className="border-l border-border px-1.5 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">×</button>
                  </div>
                ))}
              </div>
              {previewTemplate && (
                <div className="mt-3 rounded-sm border border-accent/40 bg-card p-3">
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{previewTemplate.overview}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => { onApplyTemplate(previewTemplate); setPreviewTemplate(null); }}
                      className="rounded-sm bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">このテンプレートを使う</button>
                    <button type="button" onClick={() => setPreviewTemplate(null)} className="text-xs text-muted-foreground hover:text-foreground">閉じる</button>
                  </div>
                </div>
              )}
              {deleteConfirmId && (() => {
                const target = templates.find((t) => t.id === deleteConfirmId);
                if (!target) return null;
                return (
                  <div className="mt-3 rounded-sm border border-destructive/40 bg-destructive/5 p-3">
                    <p className="text-sm font-medium text-destructive">「{target.label}」を削除しますか？この操作は取り消せません。</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => deleteTemplate(target)} disabled={deletingTemplate}
                        className="rounded-sm bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
                        {deletingTemplate ? "削除中…" : "削除する"}
                      </button>
                      <button type="button" onClick={() => setDeleteConfirmId(null)} className="text-xs text-muted-foreground hover:text-foreground">キャンセル</button>
                    </div>
                    {deleteError && <p className="mt-1.5 text-sm font-medium text-destructive">{deleteError}</p>}
                  </div>
                );
              })()}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="task_content" className="block text-sm font-medium">①作業概要 <span className="text-destructive">*</span></label>
            <p className="text-sm text-muted-foreground">何を・どこまで行うのかを書いてください。</p>
            <AutosizeTA id="task_content" value={draft.task_content} minRows={4}
              onChange={(e) => onTaskContentChange(e.target.value)}
              placeholder="例）A社向けの提案資料を、既存フォーマットに沿ってまとめる。"
              className={`w-full rounded-sm border-2 px-3 py-2 text-sm focus:outline-none ${hasTaskError ? "border-destructive" : "border-accent/50"} bg-background focus:border-foreground ${reflectedTextClass("task_content")}`} />
            {reflectedSeverity("task_content") && <ReflectedHint severity={reflectedSeverity("task_content")!} />}
            {emptyContentNote("task_content") && <p className="text-sm font-bold text-destructive">{emptyContentNote("task_content")}</p>}
            {coachingQuestion("task_content") && <p className="text-sm text-blue-700">❓ {coachingQuestion("task_content")}</p>}
          </div>

          <div className="space-y-2">
            <label htmlFor="background" className="block text-sm font-medium">②背景（なぜ） <span className="text-destructive">*</span></label>
            <p className="text-sm text-muted-foreground">なぜこの業務が必要か（理由・重要性）を書くと、書ききれない細部も相手が意図から補えます。</p>
            <AutosizeTA id="background" value={draft.background} minRows={3}
              onChange={(e) => onBackgroundChange(e.target.value)}
              placeholder="例）来週の商談で使うため。過去の提案が好評だったフォーマットを踏襲したい。"
              className={`w-full rounded-sm border-2 border-accent/50 bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none ${reflectedTextClass("background")}`} />
            {reflectedSeverity("background") && <ReflectedHint severity={reflectedSeverity("background")!} />}
            {emptyContentNote("purpose_background") && <p className="text-sm font-bold text-destructive">{emptyContentNote("purpose_background")}</p>}
            {coachingQuestion("purpose_background") && <p className="text-sm text-blue-700">❓ {coachingQuestion("purpose_background")}</p>}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">③期限 <span className="text-destructive">*</span></label>
            <DeadlineInput value={draft.deadline} onChange={onDeadlineChange} />
          </div>

          <button type="button" onClick={onCheck} disabled={classifying || creating}
            className="w-full rounded-sm bg-foreground px-4 py-3 text-sm font-semibold text-background transition-opacity disabled:opacity-40">
            {classifying ? "確認中…" : "この内容を確認する"}
          </button>

          {!feasibility && !classifying && (
            <p className="text-sm text-muted-foreground">AIが指示を補足した方が良いと判断した場合は、自動で補足しますので、内容を確認してください。</p>
          )}

          {feasibility && businessCategory && (
            <div className="rounded-sm border border-border bg-card px-5 py-3">
              <div className="flex items-baseline gap-2">
                <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">AI業務分類（修正可）</div>
                <div className="font-medium">{businessCategory.major_label} › {businessCategory.sub_label}</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {categories.map((cat) =>
                  cat.subs.map((sub) => (
                    <button key={sub.sub} type="button"
                      onClick={() => onCategoryOverride({ major: cat.major, major_label: cat.label, sub: sub.sub, sub_label: sub.label })}
                      className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                        businessCategory.sub === sub.sub ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:border-foreground/50"
                      }`}>
                      {sub.sub} {sub.label}
                    </button>
                  )),
                )}
              </div>
              {draft.assignee_rank && (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  担当者の指示レベル：<span className="font-mono font-bold text-foreground">{draft.assignee_rank}</span>
                  （{RANK_LABELS[draft.assignee_rank as AssigneeRank]?.short}：{RANK_LABELS[draft.assignee_rank as AssigneeRank]?.description}）
                </p>
              )}
              <p className="mt-0.5 text-sm text-muted-foreground">{RANK_SELECTION_DISCLAIMER}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                {feasibility.can_execute_reason} {feasibility.can_meet_deadline_reason}
              </p>
            </div>
          )}

          {feasibility && (
            <>
              {(showCompletionField || showEstimatedHoursField || showConstraintsField) && (
                <div className="space-y-4 rounded-sm border border-border bg-muted/30 p-4">
                  {showCompletionField && (
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-foreground">④完了条件</label>
                      <p className="text-sm text-muted-foreground">第三者が判定できる形で書いてください。</p>
                      <AutosizeTA value={draft.completion_deliverable} minRows={2}
                        onChange={(e) => setDraft((prev) => ({ ...prev, completion_deliverable: e.target.value }))}
                        placeholder="例）〇〇の承認を得て提出済みの状態"
                        className={`w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none ${reflectedTextClass("completion_deliverable")}`} />
                      {reflectedSeverity("completion_deliverable") && <ReflectedHint severity={reflectedSeverity("completion_deliverable")!} />}
                      {emptyContentNote("completion_deliverable") && <p className="text-sm text-muted-foreground">💡 {emptyContentNote("completion_deliverable")}</p>}
                      {coachingQuestion("completion_deliverable") && <p className="text-sm text-blue-700">❓ {coachingQuestion("completion_deliverable")}</p>}
                      <AmbiguousWordHint text={draft.completion_deliverable} />
                    </div>
                  )}
                  {showEstimatedHoursField && (
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-foreground">⑤見込み工数</label>
                      <AutosizeTA value={draft.estimated_hours} minRows={1}
                        onChange={(e) => setDraft((prev) => ({ ...prev, estimated_hours: e.target.value }))}
                        placeholder="例）2時間程度"
                        className={`w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none ${reflectedTextClass("estimated_hours")}`} />
                      {reflectedSeverity("estimated_hours") && <ReflectedHint severity={reflectedSeverity("estimated_hours")!} />}
                      {emptyContentNote("workload_estimate") && <p className="text-sm text-muted-foreground">💡 {emptyContentNote("workload_estimate")}</p>}
                      {coachingQuestion("workload_estimate") && <p className="text-sm text-blue-700">❓ {coachingQuestion("workload_estimate")}</p>}
                    </div>
                  )}
                  {showConstraintsField && (
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-foreground">⑥注意点・制約</label>
                      <p className="text-sm text-muted-foreground">NG事項・前提・優先順位の例を書いてください。</p>
                      <AutosizeTA value={draft.constraints} minRows={2}
                        onChange={(e) => setDraft((prev) => ({ ...prev, constraints: e.target.value }))}
                        placeholder="例）過去の提案資料のフォーマットを踏襲すること"
                        className={`w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none ${reflectedTextClass("constraints")}`} />
                      {reflectedSeverity("constraints") && <ReflectedHint severity={reflectedSeverity("constraints")!} />}
                      {emptyContentNote("constraints_notes") && <p className="text-sm text-muted-foreground">💡 {emptyContentNote("constraints_notes")}</p>}
                      {coachingQuestion("constraints_notes") && <p className="text-sm text-blue-700">❓ {coachingQuestion("constraints_notes")}</p>}
                      <AmbiguousWordHint text={draft.constraints} />
                    </div>
                  )}
                </div>
              )}

              {!showMoreFields && !(showCompletionField && showEstimatedHoursField && showConstraintsField) && (
                <button type="button" onClick={() => setShowMoreFields(true)}
                  className="w-fit py-1 text-sm font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  完了条件・見込み工数・注意点をすべて表示する（任意）
                </button>
              )}

              <button type="button" onClick={onCreate} disabled={classifying || creating}
                className="w-full rounded-sm border-2 border-foreground bg-background px-4 py-3 text-sm font-semibold text-foreground transition-opacity hover:bg-muted disabled:opacity-40">
                {creating ? "作成中…" : "この内容で指示を作成する"}
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Result（作成直後のプレビュー・編集・確定前）
// ============================================================
function StepResult({
  draft, finalText, manuallyEdited, regenLoading, onFinalTextChange, onRegenerate, onBackToEdit, onGo,
}: {
  draft: InstructionDraft;
  finalText: string;
  manuallyEdited: boolean;
  regenLoading: boolean;
  onFinalTextChange: (t: string) => void;
  onRegenerate: () => void;
  onBackToEdit: () => void;
  onGo: () => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader eyebrow="Preview" title="完成した指示" description="内容を確認し、必要なら編集・再作成してから確定してください。" />
          <div className="p-6">
            {renderCompletionDeliverable(draft.completion_deliverable || "")}
            <textarea value={finalText} onChange={(e) => onFinalTextChange(e.target.value)} rows={10}
              className="mt-4 w-full resize-none rounded-sm border border-border bg-muted/40 p-5 font-sans text-sm leading-relaxed focus:border-foreground focus:outline-none" />
            {manuallyEdited && <p className="mt-1.5 text-sm text-muted-foreground">手動編集済みです。「AIで再作成する」を押すと、この編集内容は失われます。</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={onRegenerate} disabled={regenLoading}
                className="rounded-sm border border-border bg-card px-5 py-3 text-sm text-foreground hover:bg-muted disabled:opacity-40">
                {regenLoading ? "再作成中…" : "AIで再作成する"}
              </button>
              <button onClick={onBackToEdit}
                className="rounded-sm border border-border bg-card px-5 py-3 text-sm text-foreground hover:bg-muted">
                この内容を修正してもう一度作成する
              </button>
            </div>
          </div>
        </Card>
      </div>
      <aside className="space-y-4">
        <Card>
          <div className="p-6">
            <h3 className="font-serif text-lg font-semibold">この内容で確定しますか？</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              確定すると、指示の記録が保存され、Googleスプレッドシートへの出力・担当者へのメール送信が行えるようになります。本システムは内容の正確性を保証しません。確定した指示の責任は<strong className="text-foreground">指示者</strong>が持ちます。
            </p>
            <button onClick={onGo}
              className="mt-4 w-full rounded-sm bg-foreground px-4 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90">
              この内容で確定する
            </button>
          </div>
        </Card>
      </aside>
    </div>
  );
}

// ============================================================
// Done（確定済み）
// ============================================================
function StepDone({
  draft, evaluation, businessCategory, finalText, copied, saveStatus, sheetsStatus, sheetsUrl, sheetsShareWarning,
  templates, feedbackToken, assigneeEmailDefault, onCopy, onReset, onTemplateSaved,
}: {
  draft: InstructionDraft;
  evaluation: Evaluation;
  businessCategory: BusinessCategory | null;
  finalText: string;
  copied: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  sheetsStatus: "idle" | "saving" | "saved" | "error";
  sheetsUrl: string | null;
  sheetsShareWarning: string | null;
  templates: InstructionTemplate[];
  feedbackToken: string | null;
  assigneeEmailDefault: string;
  onCopy: () => void;
  onReset: () => void;
  onTemplateSaved: () => void;
}) {
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateLabel, setTemplateLabel] = useState("");
  const [templateSlot, setTemplateSlot] = useState<1 | 2 | 3 | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);
  const takenSlots = templates.map((t) => t.slot);
  const nextFreeSlot = ([1, 2, 3] as const).find((s) => !takenSlots.includes(s)) ?? null;

  const [selfSendState, setSelfSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [selfSendError, setSelfSendError] = useState<string | null>(null);
  const [assigneeEmail, setAssigneeEmail] = useState(assigneeEmailDefault);
  const [assigneeSendState, setAssigneeSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [assigneeSendError, setAssigneeSendError] = useState<string | null>(null);

  async function sendFinalTextByEmail(to?: string) {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        final_instruction: finalText,
        subject_label: evaluation.subject_label,
        ...(to ? { to, feedback_token: feedbackToken } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || "メールの送信に失敗しました");
  }
  async function handleSendToSelf() {
    if (selfSendState === "sending") return;
    setSelfSendState("sending"); setSelfSendError(null);
    try { await sendFinalTextByEmail(); setSelfSendState("sent"); }
    catch (err) { setSelfSendState("error"); setSelfSendError(err instanceof Error ? err.message : "メールの送信に失敗しました"); }
  }
  async function handleSendToAssignee() {
    if (assigneeSendState === "sending" || !EMAIL_PATTERN.test(assigneeEmail.trim())) return;
    setAssigneeSendState("sending"); setAssigneeSendError(null);
    try { await sendFinalTextByEmail(assigneeEmail.trim()); setAssigneeSendState("sent"); }
    catch (err) { setAssigneeSendState("error"); setAssigneeSendError(err instanceof Error ? err.message : "メールの送信に失敗しました"); }
  }
  async function saveTemplate() {
    const slot = templateSlot ?? nextFreeSlot;
    if (!slot || !templateLabel.trim()) { setTemplateError("テンプレート名と保存先を選択してください"); return; }
    setSavingTemplate(true); setTemplateError(null);
    try {
      const res = await fetch("/api/instruction-templates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // overviewとして送るのは①作業概要（task_content）のみ。②背景は案件ごとに
        // 異なるはずなので意図的にテンプレートへ含めない（呼び出し側のonApplyTemplate
        // 参照）。以前はdraft.overview（①②を結合した文字列）を送っていたため、
        // 呼び出し時に①へ②の内容までまとめて入ってしまっていた（実機確認で発見）。
        body: JSON.stringify({ slot, label: templateLabel.trim(), overview: draft.task_content, constraints: draft.constraints, tone: draft.tone, support_mode: draft.support_mode, importance: draft.importance }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error((d as { error?: string }).error ?? "保存に失敗しました"); }
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
          <CardHeader eyebrow="Confirmed" title="確定指示" description="この指示を担当者に共有してください。" />
          <div className="p-6">
            <pre className="whitespace-pre-wrap rounded-sm border border-border bg-muted/40 p-5 font-sans text-sm leading-relaxed">{finalText}</pre>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={onCopy} className="inline-flex items-center gap-2 rounded-sm bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90">
                {copied ? "✓ コピーしました" : "テキストをコピー"}
              </button>
              <button onClick={onReset} className="rounded-sm border border-border bg-card px-5 py-3 text-sm text-foreground hover:bg-muted">新しい指示を作成</button>
            </div>

            <div className="mt-4 space-y-3 rounded-sm border border-border bg-muted/30 p-4">
              <div>
                <button type="button" onClick={handleSendToSelf} disabled={selfSendState === "sending"}
                  className="rounded-sm border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40">
                  {selfSendState === "sending" ? "送信中…" : selfSendState === "sent" ? "✓ 自分に送信しました" : "自分に送る"}
                </button>
                {selfSendError && <p className="mt-1.5 text-sm font-medium text-destructive">{selfSendError}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <label htmlFor="assignee_email" className="text-sm text-muted-foreground">担当者のメールアドレス</label>
                <input id="assignee_email" type="email" value={assigneeEmail}
                  onChange={(e) => { setAssigneeEmail(e.target.value); setAssigneeSendState("idle"); }}
                  placeholder="例）assignee@example.com"
                  className="min-w-[220px] flex-1 rounded-sm border border-border bg-background px-3 py-1.5 text-sm focus:border-foreground focus:outline-none" />
                <button type="button" onClick={handleSendToAssignee} disabled={assigneeSendState === "sending" || !EMAIL_PATTERN.test(assigneeEmail.trim())}
                  className="rounded-sm bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40">
                  {assigneeSendState === "sending" ? "送信中…" : assigneeSendState === "sent" ? "✓ 担当者に送信しました" : "担当者に送る"}
                </button>
                {assigneeSendError && <p className="w-full text-sm font-medium text-destructive">{assigneeSendError}</p>}
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-4 flex items-center gap-3">
              {sheetsStatus === "saving" && <span className="text-sm text-muted-foreground">Googleスプレッドシートへ出力中…</span>}
              {sheetsStatus === "saved" && sheetsUrl && (
                <>
                  <span className="text-sm text-muted-foreground">✓ Googleスプレッドシートに自動出力済み</span>
                  <a href={sheetsUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground underline-offset-4 hover:underline">シートを開く →</a>
                </>
              )}
              {sheetsStatus === "error" && <span className="text-sm font-medium text-destructive">Googleスプレッドシートへの出力に失敗しました（指示自体は保存済みです）</span>}
            </div>
            {sheetsShareWarning && (
              <div className="mt-2 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                新規シートの自動作成に失敗しました（書き込み自体は成功しています）。管理者に連絡してください。詳細: {sheetsShareWarning}
              </div>
            )}

            <div className="mt-4 border-t border-border pt-4">
              {templateSaved ? (
                <div className="rounded-sm border border-success/40 bg-success/25 px-4 py-3 text-xs font-medium text-success-foreground">
                  ✓ テンプレートに保存しました。次回は入力画面の「テンプレートから始める」から呼び出せます。
                </div>
              ) : !showTemplateForm ? (
                <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-muted/30 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">この指示をテンプレートとして保存しますか？</div>
                    <p className="mt-0.5 text-sm text-muted-foreground">保存すると、次回以降に似た指示を作るとき、入力画面からワンクリックで呼び出せます（最大3件まで）。</p>
                  </div>
                  <button type="button" onClick={() => { setShowTemplateForm(true); setTemplateSlot(nextFreeSlot); setTemplateError(null); }}
                    className="shrink-0 rounded-sm border border-foreground bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-foreground hover:text-background">
                    テンプレートとして保存する
                  </button>
                </div>
              ) : (
                <div className="space-y-3 rounded-sm border border-accent/40 bg-card p-4">
                  {nextFreeSlot === null && (
                    <div>
                      <div className="mb-1.5 text-sm font-medium text-foreground">すでに3件保存されています。置き換えるテンプレートを選んでください。</div>
                      <div className="flex flex-wrap gap-1.5">
                        {templates.map((t) => (
                          <button key={t.slot} type="button" onClick={() => setTemplateSlot(t.slot)}
                            className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${templateSlot === t.slot ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:border-foreground/50"}`}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="text" value={templateLabel} onChange={(e) => setTemplateLabel(e.target.value)}
                      placeholder="テンプレート名（例：月次報告の依頼）" maxLength={30}
                      className="min-w-[220px] flex-1 rounded-sm border border-border bg-background px-3 py-1.5 text-sm focus:border-foreground focus:outline-none" />
                    <button onClick={saveTemplate} disabled={savingTemplate}
                      className="rounded-sm bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40">
                      {savingTemplate ? "保存中…" : nextFreeSlot === null ? "置き換えて保存" : "保存"}
                    </button>
                    <button type="button" onClick={() => setShowTemplateForm(false)} className="text-xs text-muted-foreground hover:text-foreground">キャンセル</button>
                  </div>
                  {templateError && <p className="text-sm font-medium text-destructive">{templateError}</p>}
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
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />確定済み
            </div>
            <h3 className="mt-3 font-serif text-xl font-semibold">確定済み</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">本システムは内容の正確性を保証しません。確定した指示の責任は<strong className="text-foreground">指示者</strong>が持ちます。</p>
            <div className="mt-4 rounded-sm border border-border px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">保存状態</div>
              {saveStatus === "saving" && <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground"><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />保存中…</div>}
              {saveStatus === "saved" && <div className="mt-1.5 text-sm font-medium text-success-foreground">✓ 保存完了</div>}
              {saveStatus === "error" && <div className="mt-1.5 text-sm font-medium text-destructive">保存に失敗しました</div>}
            </div>
            <div className="mt-5 space-y-2 border-t border-border pt-4">
              {([
                ["担当者の指示レベル", draft.assignee_rank || "—"],
                ["支援モード", SUPPORT_MODE_LABELS[draft.support_mode]],
                ...(businessCategory ? [["業務分類", businessCategory.sub_label]] : []),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
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
