import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getCurrentUserContext } from "@/lib/server-auth";
import { randomUUID, randomInt } from "crypto";

async function requireAdminContext() {
  const ctx = await getCurrentUserContext();
  if (!ctx || !["super_admin", "reseller_admin"].includes(ctx.role)) {
    return null;
  }
  return ctx;
}

// 企業ID（tenant_code）を生成する。英大文字・小文字・数字＋ハイフンを組み合わせ、
// 全社で一意になるまで最大5回リトライする。
const TENANT_CODE_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generateTenantCodeCandidate(): string {
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += TENANT_CODE_CHARS[randomInt(TENANT_CODE_CHARS.length)];
  }
  return code;
}

async function generateUniqueTenantCode(
  supabase: ReturnType<typeof getSupabaseServer>,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateTenantCodeCandidate();
    const { data } = await supabase
      .from("tenants")
      .select("id")
      .eq("tenant_code", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error("企業IDの採番に失敗しました。もう一度お試しください");
}

export async function GET() {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  try {
    const supabase = getSupabaseServer();
    let query = supabase
      .from("tenants")
      .select("id, name, slug, tenant_code, reseller_id, status, frozen_at, google_sheet_id, openai_model_normal, openai_model_important, created_at")
      .order("created_at", { ascending: false });

    if (ctx.role === "reseller_admin") {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("reseller_id")
        .eq("user_id", ctx.userId)
        .single();
      if (!roleRow?.reseller_id) return NextResponse.json([]);
      query = query.eq("reseller_id", roleRow.reseller_id);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/admin/tenants]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  let body: { name?: string; resellerId?: string; slug?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "テナント名は必須です" }, { status: 400 });

  const email = body.email?.trim();
  if (!email) return NextResponse.json({ error: "顧客管理者のメールアドレスは必須です" }, { status: 400 });

  try {
    const supabase = getSupabaseServer();

    let resellerId = body.resellerId ?? null;
    let resellerRow: { id: string; quota_limit: number; quota_used: number } | null = null;

    if (ctx.role === "reseller_admin") {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("reseller_id")
        .eq("user_id", ctx.userId)
        .single();
      resellerId = roleRow?.reseller_id ?? null;
      if (!resellerId) {
        return NextResponse.json({ error: "代理店情報が見つかりません" }, { status: 403 });
      }

      const { data: reseller, error: resellerError } = await supabase
        .from("resellers")
        .select("id, quota_limit, quota_used")
        .eq("id", resellerId)
        .single();
      if (resellerError || !reseller) {
        return NextResponse.json({ error: "代理店情報の取得に失敗しました" }, { status: 500 });
      }
      if (reseller.quota_used >= reseller.quota_limit) {
        return NextResponse.json(
          { error: "発行枠の上限に達しています。増枠については当社までご連絡ください" },
          { status: 403 },
        );
      }
      resellerRow = reseller;
    } else if (resellerId) {
      // super_adminが管理画面から代理店を指定してテナントを作成した場合も、
      // 発行枠(quota_used)を消費して代理店側の表示と整合させる（上限チェックは行わない）
      const { data: reseller } = await supabase
        .from("resellers")
        .select("id, quota_limit, quota_used")
        .eq("id", resellerId)
        .single();
      if (reseller) {
        resellerRow = reseller;
      }
    }

    const tenantCode = await generateUniqueTenantCode(supabase);

    const insertData: Record<string, unknown> = {
      name,
      reseller_id: resellerId,
      tenant_code: tenantCode,
    };
    const providedSlug = body.slug?.trim();
    if (providedSlug) {
      insertData.slug = providedSlug;
    } else {
      const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      insertData.slug = `${base || "tenant"}-${randomUUID().slice(0, 8)}`;
    }

    const { data: tenant, error } = await supabase
      .from("tenants")
      .insert(insertData)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // 初期の顧客管理者（tenant_admin）を作成し、招待メールを送信する
    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
    if (inviteError) {
      // テナント自体は作成済みなので、招待失敗はログに残しつつテナント情報は返す
      console.error("[POST /api/admin/tenants] invite failed", inviteError);
    } else if (invited?.user) {
      await supabase.from("user_roles").insert({
        user_id: invited.user.id,
        role: "tenant_admin",
        tenant_id: tenant.id,
        login_id: "admin",
        email,
      });
    }

    // reseller_adminが作成した場合、発行枠を1消費する
    if (resellerRow) {
      await supabase
        .from("resellers")
        .update({ quota_used: resellerRow.quota_used + 1 })
        .eq("id", resellerRow.id);
    }

    return NextResponse.json({ ...tenant, inviteSent: !inviteError });
  } catch (err) {
    console.error("[POST /api/admin/tenants]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "作成に失敗しました" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdminContext();
  if (!ctx) return NextResponse.json({ error: "権限がありません" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  let body: {
    name?: string;
    status?: string;
    googleSheetId?: string;
    openaiModelNormal?: string;
    openaiModelImportant?: string;
    frozen?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: "テナント名は必須です" }, { status: 400 });
    updates.name = body.name.trim();
  }

  if (ctx.role === "super_admin") {
    if (body.status !== undefined) {
      const status = body.status.trim();
      if (!status) return NextResponse.json({ error: "ステータスは必須です" }, { status: 400 });
      updates.status = status;
    }
    if (body.googleSheetId !== undefined) updates.google_sheet_id = body.googleSheetId;
    if (body.openaiModelNormal !== undefined) updates.openai_model_normal = body.openaiModelNormal.trim() || null;
    if (body.openaiModelImportant !== undefined) updates.openai_model_important = body.openaiModelImportant.trim() || null;
    if (body.frozen !== undefined) {
      updates.frozen_at = body.frozen ? new Date().toISOString() : null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "更新する項目がありません" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();

    // 凍結状態を変更する場合、代理店の発行枠（quota_used）を連動させる
    if (body.frozen !== undefined) {
      const { data: currentTenant, error: currentError } = await supabase
        .from("tenants")
        .select("frozen_at, reseller_id")
        .eq("id", id)
        .single();
      if (currentError || !currentTenant) {
        return NextResponse.json({ error: "テナント情報の取得に失敗しました" }, { status: 500 });
      }

      const wasFrozen = !!currentTenant.frozen_at;
      const willFreeze = body.frozen;

      if (currentTenant.reseller_id && wasFrozen !== willFreeze) {
        const { data: reseller } = await supabase
          .from("resellers")
          .select("quota_limit, quota_used")
          .eq("id", currentTenant.reseller_id)
          .single();

        if (reseller) {
          if (willFreeze) {
            // 凍結 → 発行枠を1つ回収し、他の企業へ再割当て可能にする
            const nextUsed = Math.max(0, reseller.quota_used - 1);
            await supabase
              .from("resellers")
              .update({ quota_used: nextUsed })
              .eq("id", currentTenant.reseller_id);
          } else {
            // 凍結解除 → 発行枠を1つ再消費する。上限に達している場合はブロック
            if (reseller.quota_used >= reseller.quota_limit) {
              return NextResponse.json(
                { error: "代理店の発行枠が上限に達しているため、凍結解除できません。先に増枠してください" },
                { status: 403 },
              );
            }
            await supabase
              .from("resellers")
              .update({ quota_used: reseller.quota_used + 1 })
              .eq("id", currentTenant.reseller_id);
          }
        }
      }
    }

    let query = supabase.from("tenants").update(updates).eq("id", id);

    if (ctx.role === "reseller_admin") {
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("reseller_id")
        .eq("user_id", ctx.userId)
        .single();
      if (!roleRow?.reseller_id) return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      query = query.eq("reseller_id", roleRow.reseller_id);
    }

    const { data, error } = await query.select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PATCH /api/admin/tenants]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新に失敗しました" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await getCurrentUserContext();
  if (!ctx || ctx.role !== "super_admin") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const supabase = getSupabaseServer();
    const { error } = await supabase.from("tenants").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/admin/tenants]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "削除に失敗しました" },
      { status: 500 },
    );
  }
}