import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import type { Evaluation, InstructionDraft } from "@/lib/mock-data";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SCORE_KEYS = [
  "purpose_background", "task_content", "completion_deliverable",
  "deadline_clarity", "workload_estimate", "constraints_notes",
] as const;
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;

async function getSheets() {
  const credJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credJson || !SHEET_ID) throw new Error("Google Sheets の環境変数が設定されていません");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credJson),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureHeader(sheets: ReturnType<typeof google.sheets>) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID!,
    range: "A1:S1",
  });
  if (res.data.values?.length) return; // header already exists

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID!,
    range: "A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        "作成日時", "担当者名", "指示レベル", "支援モード", "業務分類", "合計スコア",
        "目的・背景", "依頼内容", "完了条件", "期限", "工数", "制約",
        "整合性エラー", "合否", "元の指示概要", "最終指示文",
        "初期_目的・背景", "初期_依頼内容", "初期_完了条件", "初期_期限", "初期_工数", "初期_制約", "初期_合計スコア",
        "AI修正_目的・背景", "AI修正_依頼内容", "AI修正_完了条件", "AI修正_期限", "AI修正_工数", "AI修正_制約",
      ]],
    },
  });
}

// POST /api/sheets — appends one instruction row to the configured Google Sheet.
export async function POST(req: NextRequest) {
  if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({ error: "Google Sheets が設定されていません" }, { status: 500 });
  }

  let body: {
    draft: InstructionDraft;
    evaluation: Evaluation;
    initialEvaluation?: Evaluation | null;
    rawInput: string;
    finalText: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { draft, evaluation, initialEvaluation, rawInput, finalText } = body;

  try {
    const sheets = await getSheets();
    await ensureHeader(sheets);

    const scores = evaluation.scores;
    const cat = evaluation.business_category;
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const modeLabel = draft.support_mode === "efficiency" ? "効率重視" : "育成重視";
    const passLabel = evaluation.passed ? "合格" : "不合格";
    const initialScores = initialEvaluation?.scores;
    const ext = evaluation.structured_extraction;

    const row = [
      now,
      draft.assignee_name || "",
      draft.assignee_rank || "",
      modeLabel,
      cat ? `${cat.major_label} / ${cat.sub_label}` : "",
      evaluation.total,
      scores.purpose_background ?? "",
      scores.task_content ?? "",
      scores.completion_deliverable ?? "",
      scores.deadline_clarity ?? "",
      scores.workload_estimate ?? "",
      scores.constraints_notes ?? "",
      evaluation.consistency_error || "",
      passLabel,
      rawInput.replace(/\n/g, " "),
      finalText.replace(/\n/g, " "),
      // 19: もとの評価値（最初の評価時点。再評価しなかった場合は上と同値）
      initialScores?.purpose_background ?? "",
      initialScores?.task_content ?? "",
      initialScores?.completion_deliverable ?? "",
      initialScores?.deadline_clarity ?? "",
      initialScores?.workload_estimate ?? "",
      initialScores?.constraints_notes ?? "",
      initialEvaluation?.total ?? "",
      // 19: AI修正指示内容（structured_extraction、観点ごと）
      (ext?.purpose_background || "").replace(/\n/g, " "),
      (ext?.task_content || "").replace(/\n/g, " "),
      (ext?.completion_deliverable || "").replace(/\n/g, " "),
      (ext?.deadline_extracted || "").replace(/\n/g, " "),
      (ext?.workload_extracted || "").replace(/\n/g, " "),
      (ext?.constraints_extracted || "").replace(/\n/g, " "),
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID!,
      range: "A1",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    return NextResponse.json({ success: true, url: SHEET_URL });
  } catch (err) {
    console.error("[POST /api/sheets]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sheetsへの書き込みに失敗しました" },
      { status: 500 },
    );
  }
}
