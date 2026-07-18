import { NextRequest, NextResponse } from "next/server";
import { APIConnectionTimeoutError } from "openai";
import { composeTurn } from "@/lib/compose-core";
import { getCurrentUserId } from "@/lib/server-auth";
import type { ComposeMessage } from "@/lib/mock-data";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { messages: ComposeMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages は必須です" }, { status: 400 });
  }
  const validMessages = messages.every(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0,
  );
  if (!validMessages) {
    return NextResponse.json({ error: "messages の形式が不正です" }, { status: 400 });
  }

  try {
    const result = await composeTurn(messages);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/compose]", err);
    if (err instanceof APIConnectionTimeoutError) {
      return NextResponse.json(
        { error: "AIの応答に時間がかかりすぎたため中断しました。お手数ですが、もう一度送信してください。" },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "応答の生成に失敗しました" },
      { status: 500 },
    );
  }
}
