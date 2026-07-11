import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import type { InstructionTemplate } from "@/lib/mock-data";

/**
 * /api/instruction-templates — up to 3 per-instructor reusable instruction
 * skeletons (16-6). Always scoped to the logged-in user; there is no
 * cross-user or per-team sharing.
 */

const VALID_SLOTS = [1, 2, 3];

export async function GET() {
  const ctx = await getCurrentUserContext();
  if (!ctx?.userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("instruction_templates")
      .select("id, slot, label, overview, constraints, tone, support_mode, importance")
      .eq("user_id", ctx.userId)
      .order("slot");
    if (error) throw new Error(error.message);
    return NextResponse.json((data ?? []) as InstructionTemplate[]);
  } catch (err) {
    console.error("[GET /api/instruction-templates]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentUserContext();
  if (!ctx?.userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  let body: Partial<InstructionTemplate>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!VALID_SLOTS.includes(body.slot as number)) {
    return NextResponse.json({ error: "slotは1〜3で指定してください" }, { status: 400 });
  }
  if (!body.label?.trim() || !body.overview?.trim()) {
    return NextResponse.json({ error: "テンプレート名と指示概要は必須です" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("instruction_templates")
      .upsert(
        {
          user_id: ctx.userId,
          slot: body.slot,
          label: body.label.trim(),
          overview: body.overview,
          constraints: body.constraints ?? "",
          tone: body.tone || null,
          support_mode: body.support_mode || null,
          importance: body.importance || null,
        },
        { onConflict: "user_id,slot" },
      )
      .select("id, slot, label, overview, constraints, tone, support_mode, importance")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data as InstructionTemplate);
  } catch (err) {
    console.error("[POST /api/instruction-templates]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "保存に失敗しました" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await getCurrentUserContext();
  if (!ctx?.userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const slot = Number(new URL(req.url).searchParams.get("slot"));
  if (!VALID_SLOTS.includes(slot)) {
    return NextResponse.json({ error: "slotは1〜3で指定してください" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase
      .from("instruction_templates")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("slot", slot);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/instruction-templates]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "削除に失敗しました" },
      { status: 500 },
    );
  }
}
