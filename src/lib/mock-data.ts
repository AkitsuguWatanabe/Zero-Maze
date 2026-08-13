// ============================================================
// Core domain types — shared by client and server
// ============================================================

// 6 evaluation dimensions aligned with the 6 structured output items
export type ScoreKey =
  | "purpose_background"       // 目的・背景
  | "task_content"             // 依頼内容・作業内容
  | "completion_deliverable"   // 完了条件・成果物
  | "deadline_clarity"         // 期限
  | "workload_estimate"        // 見込み工数
  | "constraints_notes"        // 注意点・制約

export type AssigneeRank = "A" | "B" | "C" | "D"
export type SupportMode = "efficiency" | "coaching" // 効率重視（代筆） / 育成重視（助言）
export type ImportanceLevel = "standard" | "high"   // 通常（gpt-4.1-mini） / 重要（デフォルトgpt-4.1-mini、テナント設定で変更可）
export type UrgencyLevel = "high" | "medium" | "low" | ""
export type ToneType = "junior" | "peer" | "senior" | "external" | ""

export type BusinessCategory = {
  major: "1" | "2" | "3" | "4"
  major_label: string
  sub: "1-1" | "1-2" | "2-1" | "2-2" | "3-1" | "3-2" | "4-1" | "4-2"
  sub_label: string
}

export type CategoryRanks = Partial<Record<BusinessCategory["sub"], AssigneeRank>>

// Per-team override of a single business-category slot's display label.
// The 8-slot structure (major/sub keys) is fixed globally; only the label text varies by team.
export type TeamCategoryOverride = {
  team_id: string
  major: BusinessCategory["major"]
  major_label: string
  sub: BusinessCategory["sub"]
  sub_label: string
}

export type MemberProfile = {
  id: string
  name: string
  email?: string | null
  profile: CategoryRanks
  created_at?: string
}

export type Perspective = {
  key: ScoreKey
  label: string
  subLabel: string
  description: string
}

// AI-extracted structured items — one per ScoreKey dimension
export type StructuredExtraction = {
  purpose_background: string
  task_content: string
  completion_deliverable: string
  deadline_extracted: string
  workload_extracted: string
  constraints_extracted: string
}

// 16-6: up to 3 per-instructor reusable instruction skeletons, saved from a
// GO-confirmed instruction. Only the "skeleton" fields are carried over —
// instance-specific fields (deadline, assignee, estimated_hours, urgency) are
// deliberately excluded so re-using a template never silently reuses stale specifics.
export type InstructionTemplate = {
  id: string
  slot: 1 | 2 | 3
  label: string
  overview: string
  constraints: string
  tone: ToneType
  support_mode: SupportMode
  importance: ImportanceLevel
}

// Guided-fill design (記入誘導型). task_content/background are the two
// required free-text fields the user actually types into; overview is a
// derived join of the two (via composeOverview) kept around so the existing
// extractStructured/generateFinalInstruction prompt-building code (which reads
// draft.overview) keeps working unmodified.
export type InstructionDraft = {
  overview: string          // derived: composeOverview(task_content, background) — do not edit directly
  task_content: string      // ①作業概要 (required)
  background: string        // ②背景（なぜ＝理由・必要性・重要性） (required)
  deadline: string          // ③期限 (required, ISO date yyyy-mm-dd from a date picker)
  completion_deliverable: string // ④完了条件 (conditionally required)
  estimated_hours: string   // ⑤見込み工数 (conditionally required)
  urgency: UrgencyLevel     // 緊急度 (optional)
  constraints: string       // ⑥注意点・制約 (conditionally required)
  assignee_name: string     // 担当者名
  tone: ToneType            // 担当者との関係性
  assignee_rank: AssigneeRank | "" // auto-derived from profile × business category
  support_mode: SupportMode
  importance: ImportanceLevel  // 評価精度モード: 通常=gpt-4.1-mini / 重要=gpt-5.5（テナント設定で変更可）
}

// Recompute after every task_content/background edit. Keeping this as an
// explicit join (rather than e.g. concatenation) makes the AI-facing text
// self-labeling, which keeps prompt quality steady for the unmodified
// downstream extractStructured/generateFinalInstruction code.
export function composeOverview(taskContent: string, background: string): string {
  return `【作業概要】\n${taskContent}\n\n【背景】\n${background}`
}

export type ComposeMessage = {
  role: "user" | "assistant"
  content: string
}

// /workflow/composeは①作業概要（task_content）の下書きだけを作る補助機能。
// ②背景・③期限・④⑤⑥は/workflow側の各欄（②は専用の入力欄とガイド文、
// ③は日付ピッカー、④⑤⑥は遂行可能性チェック後の自動提案）で個別に
// カバーされるため、compose側では扱わない。
export type ComposeDraft = Pick<InstructionDraft, "task_content">

export type ComposeTurnResult = {
  type: "question" | "done"
  message: string
  draft: ComposeDraft | null
}

// sessionStorage key used to hand a composed draft from /workflow/compose to /workflow.
export const COMPOSED_DRAFT_STORAGE_KEY = "zeromaze:composedDraft"

export type Evaluation = {
  structured_extraction: StructuredExtraction
  business_category: BusinessCategory | null
  consistency_error: string | null       // deadline vs workload physical contradiction
  final_instruction: string
  subject_label: string
  milestones: string[] | null
}

// フェーズ3（数値スコア廃止）でGO確定時にDBへ保存するようになった質的判定。
// judgeFeasibility()の戻り値（FeasibilityJudgment、画面表示にも使う）から
// 導出する — 新規のAI呼び出しは不要。
export type FeasibilityVerdictRecord = {
  can_execute_verdict: FeasibilityVerdict
  can_execute_reason: string
  can_meet_deadline_verdict: FeasibilityVerdict
  can_meet_deadline_reason: string
  missing_perspective_keys: ScoreKey[]
}

// ============================================================
// Constants
// ============================================================

// 6 perspectives aligned with the 6 structured output items
export const PERSPECTIVES: Perspective[] = [
  {
    key: "purpose_background",
    label: "目的・背景",
    subLabel: "Purpose",
    description: "なぜこの業務を行うのか、背景・ねらいが明確か",
  },
  {
    key: "task_content",
    label: "依頼内容・作業内容",
    subLabel: "Task",
    description: "何を・どこまで・どんな形式で行うのか具体化されているか",
  },
  {
    key: "completion_deliverable",
    label: "完了条件・成果物",
    subLabel: "Completion",
    description: "成果物の形式・提出先・承認者が明確か",
  },
  {
    key: "deadline_clarity",
    label: "期限",
    subLabel: "Deadline",
    description: "期限が日時レベルで明示されているか",
  },
  {
    key: "workload_estimate",
    label: "見込み工数",
    subLabel: "Workload",
    description: "作業量の目安が示され、期限と整合しているか",
  },
  {
    key: "constraints_notes",
    label: "注意点・制約",
    subLabel: "Constraints",
    description: "NG事項・優先順位・前提条件が提示されているか",
  },
]

export const RANK_LABELS: Record<AssigneeRank, { short: string; description: string }> = {
  A: { short: "自走",   description: "目的さえ伝えれば自走できる" },
  B: { short: "標準",   description: "標準手順は習得済み" },
  C: { short: "要支援", description: "要所での確認・手順提示が必要" },
  D: { short: "要指導", description: "最初から詳細な手順が必要" },
}

// T3: 指示レベルは人事評価ではなく「指示コストの目安」であることの明示。
export const RANK_SELECTION_DISCLAIMER =
  "指示をどれだけ詳しく書く必要があるかを選ぶだけです（人事評価ではありません）。"

export const SUPPORT_MODE_LABELS: Record<SupportMode, string> = {
  efficiency: "効率重視（代筆）",
  coaching:   "育成重視（助言）",
}

export const SUPPORT_MODE_DESC: Record<SupportMode, string> = {
  efficiency: "AIが具体的な修正文案を提示します。そのままコピー&ペーストして使えます。",
  coaching:   "AIが問いかけとヒントを提示します。指示者自身が考えて修正する力を養います。",
}

export const URGENCY_LABELS: Record<string, { label: string; color: string }> = {
  high:   { label: "高（至急）",    color: "text-red-600" },
  medium: { label: "中（通常）",    color: "text-amber-600" },
  low:    { label: "低（余裕あり）", color: "text-green-600" },
}

export const TONE_LABELS: Record<string, { label: string; hint: string }> = {
  junior:   { label: "新人・部下",    hint: "丁寧に、詳しく" },
  peer:     { label: "同僚・標準",    hint: "標準的な敬語" },
  senior:   { label: "ベテラン・先輩", hint: "簡潔に、尊重" },
  external: { label: "外部パートナー", hint: "フォーマル・丁寧" },
}

export const BUSINESS_CATEGORIES: Array<{
  major: BusinessCategory["major"]
  label: string
  subs: Array<{ sub: BusinessCategory["sub"]; label: string }>
}> = [
  {
    major: "1",
    label: "情報収集・把握",
    subs: [
      { sub: "1-1", label: "調査・実態確認" },
      { sub: "1-2", label: "ヒアリング・聴取" },
    ],
  },
  {
    major: "2",
    label: "判断・段取り",
    subs: [
      { sub: "2-1", label: "分析・考察" },
      { sub: "2-2", label: "企画・計画立案" },
    ],
  },
  {
    major: "3",
    label: "記録・報告",
    subs: [
      { sub: "3-1", label: "整理・構造化" },
      { sub: "3-2", label: "定型報告・可視化" },
    ],
  },
  {
    major: "4",
    label: "実行・実務",
    subs: [
      { sub: "4-1", label: "対人交渉・調整" },
      { sub: "4-2", label: "技能操作・実務遂行" },
    ],
  },
]

// Merge a team's label overrides onto the global default 8-slot structure.
// Slots without an override keep the global default label.
export function mergeTeamCategories(
  overrides: TeamCategoryOverride[] | null | undefined,
): typeof BUSINESS_CATEGORIES {
  if (!overrides || overrides.length === 0) return BUSINESS_CATEGORIES

  const subOverride = new Map(overrides.map((o) => [o.sub, o]))
  const majorLabelOverride = new Map(overrides.map((o) => [o.major, o.major_label]))

  return BUSINESS_CATEGORIES.map((cat) => ({
    major: cat.major,
    label: majorLabelOverride.get(cat.major) ?? cat.label,
    subs: cat.subs.map((sub) => ({
      sub: sub.sub,
      label: subOverride.get(sub.sub)?.sub_label ?? sub.label,
    })),
  }))
}

// Flatten the merged categories back into BusinessCategory[] shape (for prompt building).
export function flattenCategories(
  categories: typeof BUSINESS_CATEGORIES,
): BusinessCategory[] {
  return categories.flatMap((cat) =>
    cat.subs.map((sub) => ({
      major: cat.major,
      major_label: cat.label,
      sub: sub.sub,
      sub_label: sub.label,
    })),
  )
}

export const SAMPLE_DRAFT: InstructionDraft = {
  overview: "A社向けの提案資料をまとめておいてください。",
  task_content: "A社向けの提案資料をまとめておいてください。",
  background: "",
  deadline: "",
  completion_deliverable: "",
  estimated_hours: "",
  urgency: "medium",
  constraints: "",
  assignee_name: "",
  tone: "peer",
  assignee_rank: "C",
  support_mode: "efficiency",
  importance: "standard",
}

export const IMPORTANCE_LABELS: Record<ImportanceLevel, { label: string; desc: string; model: string }> = {
  standard: { label: "通常",  desc: "社内・一般業務（低コスト）",           model: "gpt-4.1-mini" },
  high:     { label: "重要",  desc: "社外・法務・人事・高リスク案件",           model: "gpt-5.5" },
}

// ============================================================
// Feasibility judgment (記入誘導型) — replaces the old numeric pass/fail
// score exposed to the user. No numeric or probability field anywhere in
// this type: the AI returns a qualitative ○/△/× verdict on two axes plus
// plain-language reasons, and scores stay purely a server-side record.
// ============================================================

export type FeasibilityVerdict = "ok" | "caution" | "risk" // ○ / △ / ×

export type MissingPerspective = {
  key: ScoreKey // reuse the 6-key enum so the UI can render PERSPECTIVES[key].label
  note: string  // short qualitative reason, no numbers
  // A ready-to-insert sentence the user can append to the corresponding
  // field to close the gap (efficiency mode: concrete text; coaching mode:
  // a guiding question instead — see judgeFeasibility's mode param). Empty
  // string when key is "deadline_clarity", since the date picker has no
  // free-text field to insert into.
  suggested_addition: string
}

export type FeasibilityJudgment = {
  can_execute_correctly: FeasibilityVerdict // (a) 正しくできるか
  can_execute_reason: string
  can_meet_deadline: FeasibilityVerdict     // (b) 間に合うか
  can_meet_deadline_reason: string
  missing_perspectives: MissingPerspective[]
}

// Whether to reveal ④完了条件 ⑤見込み工数 ⑥注意点・制約. Computed
// deterministically in TS (not decided freeform by the AI's prose) so it's
// predictable and testable — but driven by missing_perspectives (which key
// the AI actually commented on), not by the two-axis verdict alone. Using
// the verdict alone would open all three together whenever either axis
// wasn't a clean ○, even for the field(s) the AI had nothing to say about —
// that produces empty, comment-less boxes.
export function computeRevealFlags(
  judgment: FeasibilityJudgment,
): { completion_deliverable: boolean; estimated_hours: boolean; constraints: boolean } {
  const flaggedKeys = new Set(judgment.missing_perspectives.map((m) => m.key))
  return {
    completion_deliverable: flaggedKeys.has("completion_deliverable"),
    estimated_hours: flaggedKeys.has("workload_estimate"),
    constraints: flaggedKeys.has("constraints_notes"),
  }
}
