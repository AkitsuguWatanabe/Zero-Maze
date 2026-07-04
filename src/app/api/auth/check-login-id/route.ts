import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

/**
 * 企業ID＋ログインIDの組み合わせが実在するかを確認する。
 * 13-4新ログイン方式・第一段階：パスワード入力前に、この組み合わせで
 * ログインを続行できるかをリアルタイム判定するために使う。
 * 未認証（ログイン前）から呼ばれる公開エンドポイントのため、
 * メールアドレス・氏名・ロールなどの個人情報は一切返さず、真偽値のみ返す。
 */
export async function POST(req: NextRequest) {
  let body: { tenantCode?: string; loginId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantCode = body.tenantCode?.trim();
  const loginId = body.loginId?.trim();

  if (!tenantCode || !loginId) {
    return NextResponse.json({ exists: false });
  }

  try {
    const supabase = getSupabaseServer();

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, frozen_at")
      .eq("tenant_code", tenantCode)
      .maybeSingle();

    // 企業IDが存在しない、または凍結中の場合は「見つかりません」として扱う
    // （凍結状態を未認証の相手に開示しないよう、通常の未存在と同じ結果を返す）
    if (!tenant || tenant.frozen_at) {
      return NextResponse.json({ exists: false });
    }

    const { data: userRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", tenant.id)
      .eq("login_id", loginId)
      .maybeSingle();

    return NextResponse.json({ exists: !!userRole });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "確認に失敗しました" },
      { status: 500 },
    );
  }
}