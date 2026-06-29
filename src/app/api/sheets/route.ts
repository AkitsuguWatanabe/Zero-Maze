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
        "作成日時", "担当者名", "ランク", "支援モード", "業務分類", "合計スコア",
        "目的・背景", "依頼内容", "完了条件", "期限", "工数", "制約",
        "整合性エラー", "合否", "元の指示概要", "最終指示文",
      ]],
    },
  });
}

// POST /api/sheets — appends one instruction row to the configured Google Sheet.
export async function POST(req: NextRequest) {
  if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({ error: "Google Sheets が設定されていません" }, { status: 500 });
  }

  let body: { draft: InstructionDraft; evaluation: Evaluation; rawInput: string; finalText: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { draft, evaluation, rawInput, finalText } = body;

  try {
    const sheets = await getSheets();
    await ensureHeader(sheets);

    const scores = evaluation.scores;
    const cat = evaluation.business_category;
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const modeLabel = draft.support_mode === "efficiency" ? "効率重視" : "育成重視";
    const passLabel = evaluation.passed ? "合格" : "不合格";

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
