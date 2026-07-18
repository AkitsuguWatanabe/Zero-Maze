import { NextRequest, NextResponse } from "next/server";
import { APIConnectionTimeoutError } from "openai";
import { reviseOverviewWithSuggestions } from "@/lib/evaluate-core";
import { getCurrentUserId, getTenantModelOverrides } from "@/lib/server-auth";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { overview?: string; suggestions?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const overview = body?.overview?.trim();
  const suggestions = body?.suggestions;
  if (!overview) {
    return NextResponse.json({ error: "指示概要（overview）は必須です" }, { status: 400 });
  }
  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return NextResponse.json({ error: "反映する提案がありません" }, { status: 400 });
  }

  try {
    const overrides = await getTenantModelOverrides();
    const revised = await reviseOverviewWithSuggestions(overview, suggestions, overrides.standard ?? undefined);
    return NextResponse.json({ overview: revised });
  } catch (err) {
    console.error("[/api/revise-overview]", err);
    if (err instanceof APIConnectionTimeoutError) {
      return NextResponse.json({ error: "AIの応答がタイムアウトしました。" }, { status: 504 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "反映に失敗しました" },
      { status: 500 },
    );
  }
}
