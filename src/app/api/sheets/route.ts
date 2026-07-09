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

// 20-7: テナント（企業）ごとにGoogle Sheet IDを分けられるようにするため、
// どのテナントのデータかを常に列として残す（未設定テナントは共通シートに
// 書き込まれるため、その場合の判別にも使う）。既存の共通シートのヘッダー行
// との位置ズレを避けるため、企業名は先頭ではなく末尾に追加する（19と同じ方針：
// 既存シートのヘッダーには手動で追加してもらう想定）。
const HEADER_ROW = [
  "作成日時", "担当者名", "指示レベル", "支援モード", "業務分類", "合計スコア",
  "目的・背景", "依頼内容", "完了条件", "期限", "工数", "制約",
  "整合性エラー", "合否", "元の指示概要", "最終指示文",
  "初期_目的・背景", "初期_依頼内容", "初期_完了条件", "初期_期限", "初期_工数", "初期_制約", "初期_合計スコア",
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

async function ensureHeader(sheets: ReturnType<typeof google.sheets>, sheetId: string, sheetName?: string) {
  const range = sheetName ? `${sheetName}!A1:T1` : "A1:T1";
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  if (res.data.values?.length) return; // header already exists

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
