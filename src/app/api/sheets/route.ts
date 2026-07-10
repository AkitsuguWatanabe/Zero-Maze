import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import type { Evaluation, InstructionDraft } from "@/lib/mock-data";
import { getCurrentUserContext } from "@/lib/server-auth";
import { getSupabaseServer } from "@/lib/supabase";

const DEFAULT_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SCORE_KEYS = [
  "purpose_background", "task_content", "completion_deliverable",
  "deadline_clarity", "workload_estimate", "constraints_notes",
] as const;

// 19: Sheet1と同じ内容を、行固定・列幅自動調整済みの状態で保つ一覧用シート。
const SHEET2_NAME = "Sheet2";

// 20-8: 「当初（再評価前）の点数・指示概要」と「最新の点数・指示概要」を
// それぞれひとかたまりで並べ、指示がどう改善されたか一目で追えるようにする。
// AI修正_〜（AIが観点ごとに抽出したテキスト）と企業名は末尾に維持。
const HEADER_ROW = [
  "作成日時", "担当者名", "指示レベル", "支援モード", "業務分類",
  "当初_合計スコア", "当初_目的・背景", "当初_依頼内容", "当初_完了条件", "当初_期限", "当初_工数", "当初_制約",
  "当初_整合性エラー", "当初_合否", "当初の指示概要",
  "最新_合計スコア", "最新_目的・背景", "最新_依頼内容", "最新_完了条件", "最新_期限", "最新_工数", "最新_制約",
  "最新_整合性エラー", "最新_合否", "最新の指示概要",
  "AI修正_目的・背景", "AI修正_依頼内容", "AI修正_完了条件", "AI修正_期限", "AI修正_工数", "AI修正_制約",
  "企業名",
];

async function getSheets(sheetId: string) {
  const credJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credJson || !sheetId) throw new Error("Google Sheets の環境変数が設定されていません");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credJson),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// 1始まりの列番号をA1形式の列名に変換する（27→AA など）
function columnLetter(index: number): string {
  let s = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function ensureHeader(sheets: ReturnType<typeof google.sheets>, sheetId: string, sheetName?: string) {
  const lastCol = columnLetter(HEADER_ROW.length);
  const range = sheetName ? `${sheetName}!A1:${lastCol}1` : `A1:${lastCol}1`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  const existing = res.data.values?.[0] ?? [];

  // 20-8: データは常にHEADER_ROWの並び順どおりに書き込まれるため、ヘッダー行は
  // 常にHEADER_ROWと完全一致している必要がある。過去バージョンのヘッダー（列数が
  // 少ない、または列の意味が変わった）が残っていると項目名とデータがずれるので、
  // 一致しない場合は無条件に上書きする（末尾への追記だけでは列の並び替えに対応できない）。
  const matches = existing.length === HEADER_ROW.length && HEADER_ROW.every((h, i) => existing[i] === h);
  if (matches) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: sheetName ? `${sheetName}!A1` : "A1",
    valueInputOption: "RAW",
    requestBody: { values: [HEADER_ROW] },
  });
}

/**
 * 19: Sheet1を横に長くスクロールしないと全体を見渡せないため、同じ内容を
 * 行固定・列幅自動調整済みの状態で保つ「Sheet2」を用意する。
 * 存在しなければ作成し、ヘッダー・行固定・列幅調整を一度だけ設定する。
 */
async function ensureSheet2(sheets: ReturnType<typeof google.sheets>, sheetId: string): Promise<number | null> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === SHEET2_NAME);

  if (existing) {
    await ensureHeader(sheets, sheetId, SHEET2_NAME);
    return existing.properties?.sheetId ?? null;
  }

  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: SHEET2_NAME } } }] },
  });
  const sheet2Id = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? null;

  await ensureHeader(sheets, sheetId, SHEET2_NAME);

  if (typeof sheet2Id === "number") {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [{
          updateSheetProperties: {
            properties: { sheetId: sheet2Id, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        }],
      },
    });
  }
  return sheet2Id;
}

async function autoResizeColumns(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string, gridSheetId: number) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        autoResizeDimensions: {
          dimensions: { sheetId: gridSheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADER_ROW.length },
        },
      }],
    },
  });
}

// POST /api/sheets — appends one instruction row to the caller's tenant Google Sheet
// (falls back to the shared default sheet when the tenant has none configured).
export async function POST(req: NextRequest) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({ error: "Google Sheets が設定されていません" }, { status: 500 });
  }

  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  let tenantName = "";
  let sheetId = DEFAULT_SHEET_ID;
  if (ctx.tenantId) {
    const supabase = getSupabaseServer();
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, google_sheet_id")
      .eq("id", ctx.tenantId)
      .maybeSingle();
    tenantName = tenant?.name ?? "";
    sheetId = tenant?.google_sheet_id || DEFAULT_SHEET_ID;
  }

  if (!sheetId) {
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
    const sheets = await getSheets(sheetId);
    await ensureHeader(sheets, sheetId);

    // 20-8: 「当初（再評価前）」と「最新」をそれぞれ点数＋指示概要のひとかたまりで
    // 並べる。当初側は initialEvaluation（無ければ evaluation にフォールバック）、
    // 最新側は常に evaluation（=effectiveEvaluation、直近の評価結果）を使う。
    const initial = initialEvaluation ?? evaluation;
    const initialScores = initial.scores;
    const latestScores = evaluation.scores;
    const cat = evaluation.business_category;
    const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const modeLabel = draft.support_mode === "efficiency" ? "効率重視" : "育成重視";
    const ext = evaluation.structured_extraction;

    const row = [
      now,
      draft.assignee_name || "",
      draft.assignee_rank || "",
      modeLabel,
      cat ? `${cat.major_label} / ${cat.sub_label}` : "",
      // 当初（再評価前）の点数・指示概要
      initial.total,
      initialScores.purpose_background ?? "",
      initialScores.task_content ?? "",
      initialScores.completion_deliverable ?? "",
      initialScores.deadline_clarity ?? "",
      initialScores.workload_estimate ?? "",
      initialScores.constraints_notes ?? "",
      initial.consistency_error || "",
      initial.passed ? "合格" : "不合格",
      // rawInput はクライアント側で再評価前の最初の入力文（initialRawInput）に固定して渡される
      rawInput.replace(/\n/g, " "),
      // 最新の点数・指示概要（最終指示文）
      evaluation.total,
      latestScores.purpose_background ?? "",
      latestScores.task_content ?? "",
      latestScores.completion_deliverable ?? "",
      latestScores.deadline_clarity ?? "",
      latestScores.workload_estimate ?? "",
      latestScores.constraints_notes ?? "",
      evaluation.consistency_error || "",
      evaluation.passed ? "合格" : "不合格",
      finalText.replace(/\n/g, " "),
      // AI修正指示内容（structured_extraction、観点ごと。常に最新の評価に基づく）
      (ext?.purpose_background || "").replace(/\n/g, " "),
      (ext?.task_content || "").replace(/\n/g, " "),
      (ext?.completion_deliverable || "").replace(/\n/g, " "),
      (ext?.deadline_extracted || "").replace(/\n/g, " "),
      (ext?.workload_extracted || "").replace(/\n/g, " "),
      (ext?.constraints_extracted || "").replace(/\n/g, " "),
      tenantName,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "A1",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    // 19: Sheet1と同じ内容を、見やすく整形した一覧としてSheet2にも書き込む。
    // 失敗してもSheet1への保存自体は既に完了しているため、ここは握りつぶす。
    try {
      const sheet2Id = await ensureSheet2(sheets, sheetId);
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${SHEET2_NAME}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [row] },
      });
      if (typeof sheet2Id === "number") await autoResizeColumns(sheets, sheetId, sheet2Id);
    } catch (e) {
      console.error("[POST /api/sheets] Sheet2 update failed:", e);
    }

    return NextResponse.json({ success: true, url: `https://docs.google.com/spreadsheets/d/${sheetId}` });
  } catch (err) {
    console.error("[POST /api/sheets]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sheetsへの書き込みに失敗しました" },
      { status: 500 },
    );
  }
}
