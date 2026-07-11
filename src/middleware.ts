import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Only these paths require a login session.
const PROTECTED_PREFIXES = [
  "/workflow",
  "/members",
  "/advice",
  "/admin",
  "/api/evaluate",
  "/api/generate-text",
  "/api/instructions",
  "/api/members",
  "/api/advice",
  "/api/users",
  "/api/me",
  "/api/export",
  "/api/notifications",
  "/api/sheets",
];

// 管理画面（/admin）はsuper_admin / reseller_admin / tenant_adminのみアクセス可能
const ADMIN_ONLY_PREFIXES = ["/admin"];

// 製品紹介LP専用ドメイン。ルート("/")アクセス時のみ/lpの内容を返す。
const LP_HOSTNAME = "app-lp.zero-maze.com";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.nextUrl.hostname === LP_HOSTNAME && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/lp";
    return NextResponse.rewrite(url);
  }

  if (!PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /admin はロールチェックが必要
  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    const role = roleRow?.role ?? "member";
    if (!["super_admin", "tenant_admin", "reseller_admin", "team_leader"].includes(role)) {
      const homeUrl = new URL("/", request.url);
      return NextResponse.redirect(homeUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};