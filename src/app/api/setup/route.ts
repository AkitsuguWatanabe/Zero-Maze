import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw new Error(error.message);
    return NextResponse.json({ hasUsers: (data.users?.length ?? 0) > 0 });
  } catch (err) {
    console.error("[GET /api/setup]", err);
    return NextResponse.json({ error: "確認に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email?: string; password?: string };

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: "メールアドレスとパスワードは必須です" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "パスワードは8文字以上で設定してください" }, { status: 400 });
    }

    const supabase = getSupabaseServer();

    const { data: existing } = await supabase.auth.admin.listUsers();
    if ((existing?.users?.length ?? 0) > 0) {
      return NextResponse.json(
        { error: "すでにユーザーが登録されています。ログインページからサインインしてください。" },
        { status: 409 },
      );
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { display_name: email.trim().split("@")[0] },
    });

    if (error) throw new Error(error.message);

    try {
      await supabase.from("user_roles").insert({
        user_id:   data.user.id,
        role:      "tenant_admin",
        tenant_id: DEFAULT_TENANT_ID,
      });
    } catch { /* テーブルが存在しない場合はスキップ */ }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/setup]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "作成に失敗しました" },
      { status: 500 },
    );
  }
}
