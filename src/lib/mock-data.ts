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
export type ImportanceLevel = "standard" | "high"   // 通常（gpt-4.1-mini） / 重要（gpt-5.5）
export type UrgencyLevel = "high" | "medium" | "low" | ""
export type ToneType = "junior" | "peer" | "senior" | "external" | ""

export type BusinessCategory = {
  major: "1" | "2" | "3" | "4"
  major_label: string
  sub: "1-1" | "1-2" | "2-1" | "2-2" | "3-1" | "3-2" | "4-1" | "4-2"
  sub_label: string
}

export type CategoryRanks = Partial<Record<BusinessCategory["sub"], AssigneeRank>>

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

export type Scores = Record<ScoreKey, number>

export type Comment = {
  key: ScoreKey
  score: number
  reason: string
  suggestion: string  // mode-aware: concrete rewrite (efficiency) or guiding question (coaching)
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

// Input: overview-first design. Boss types a free-text overview;
// optional fields provide additional context the AI can use.
export type InstructionDraft = {
  overview: string          // 指示概要 (required, free text / bullets)
  deadline: string          // 期限 (optional, can be extracted from overview)
  estimated_hours: string   // 見込み工数 (optional)
  urgency: UrgencyLevel     // 緊急度 (optional)
  constraints: string       // 注意点・制約 (optional hint)
  assignee_name: string     // 担当者名
  tone: ToneType            // 担当者との関係性
  assignee_rank: AssigneeRank | "" // auto-derived from profile × business category
  support_mode: SupportMode
  importance: ImportanceLevel  // 評価精度モード: 通常=gpt-4.1-mini / 重要=gpt-5.5
}

export type Evaluation = {
  scores: Scores
  total: number                          // out of 30
  comments: Comment[]                    // 6 items, aligned with structured_extraction
  structured_extraction: StructuredExtraction
  business_category: BusinessCategory | null
  consistency_error: string | null       // deadline vs workload physical contradiction
  has_sequential_steps: boolean          // D-rank mandatory check
  // final_instruction is ONLY populated when passed === true
  final_instruction: string
  milestones: string[] | null
  // Computed server-side
  pass_threshold: number
  mandatory_met: boolean
  over_interference: boolean             // A-rank: task_content===5 or has_sequential_steps
  passed: boolean
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

// 30-point scale (6 × 5). Thresholds scaled proportionally from the 25-pt profile sheet.
export const RANK_THRESHOLDS: Record<AssigneeRank, number> = {
  A: 12,   // ~40% (was 10/25)
  B: 18,   // ~60% (was 15/25)
  C: 22,   // ~73% (was 19/25)
  D: 27,   // ~90% (was 23/25)
}

export const RANK_LABELS: Record<AssigneeRank, { short: string; description: string }> = {
  A: { short: "自走",   description: "目的さえ伝えれば自走できる" },
  B: { short: "標準",   description: "標準手順は習得済み" },
  C: { short: "要支援", description: "要所での確認・手順提示が必要" },
  D: { short: "要指導", description: "最初から詳細な手順が必要" },
}

export const SUPPORT_MODE_LABELS: Record<SupportMode, string> = {
  efficiency: "効率重視（代筆）",
  coaching:   "育成重視（助言）",
}

export const SUPPORT_MODE_DESC: Record<SupportMode, string> = {
  efficiency: "AIが具体的な修正文案を提示します。そのままコピー&ペーストして使えます。",
  coaching:   "AIが問いかけとヒントを提示します。指示者自身が考えて修正する力を養います。",
}

export const URGENCY_LABELS: Record<string, { label: string; color: string }> = {
  high:   { label: "高（至急）",    color: "text-red-600 dark:text-red-400" },
  medium: { label: "中（通常）",    color: "text-amber-600 dark:text-amber-400" },
  low:    { label: "低（余裕あり）", color: "text-green-600 dark:text-green-400" },
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

export const SCORE_LABELS: Record<number, string> = {
  1: "開始不可・情報なし",
  2: "複数の疑問が残る",
  3: "確認が1件必要",
  4: "概ね問題なし",
  5: "迷いなく進められる",
}

export const SAMPLE_DRAFT: InstructionDraft = {
  overview: "A社向けの提案資料をまとめておいてください。",
  deadline: "",
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
  high:     { label: "重要",  desc: "社外・法務・人事・高リスク案件（高精度）", model: "gpt-5.5" },
}

// ============================================================
// Mandatory validation — per rank, using new 6-key names
// ============================================================

export function getMandatoryLabel(rank: AssigneeRank): string[] {
  switch (rank) {
    case "D": return [
      "依頼内容 4点以上", "完了条件 4点以上", "制約 4点以上",
      "期限 3点以上", "工数 3点以上", "手順3ステップ以上",
    ]
    case "C": return [
      "依頼内容 4点以上", "制約 4点以上",
      "完了条件 3点以上", "期限 3点以上", "工数 3点以上",
    ]
    case "B": return ["完了条件 4点以上", "期限 3点以上", "工数 3点以上"]
    // A: 目的 4点以上 + 完了条件・期限・工数 3点以上
    case "A": return [
      "目的・背景 4点以上",
      "完了条件 3点以上", "期限 3点以上", "工数 3点以上",
    ]
  }
}

export function checkMandatory(
  rank: AssigneeRank,
  scores: Record<ScoreKey, number>,
  hasSteps: boolean,
): boolean {
  const s = scores
  switch (rank) {
    case "D":
      return (
        s.task_content >= 4 &&
        s.completion_deliverable >= 4 &&
        s.constraints_notes >= 4 &&
        s.deadline_clarity >= 3 &&
        s.workload_estimate >= 3 &&
        hasSteps
      )
    case "C":
      return (
        s.task_content >= 4 &&
        s.constraints_notes >= 4 &&
        s.completion_deliverable >= 3 &&
        s.deadline_clarity >= 3 &&
        s.workload_estimate >= 3
      )
    case "B":
      return (
        s.completion_deliverable >= 4 &&
        s.deadline_clarity >= 3 &&
        s.workload_estimate >= 3
      )
    case "A":
      // 目的 4点以上 + 完了条件・期限・工数 3点以上（ドキュメント §A必須条件）
      return (
        s.purpose_background >= 4 &&
        s.completion_deliverable >= 3 &&
        s.deadline_clarity >= 3 &&
        s.workload_estimate >= 3
      )
  }
}
