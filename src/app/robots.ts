import { headers } from "next/headers";
import type { MetadataRoute } from "next";

// layout.tsx / middleware.tsのLP_HOSTNAMEと同じ値。変更する場合は全部直すこと。
const LP_HOSTNAME = "app-lp.zero-maze.com";

// app.zero-maze.com（ログイン前提の本体アプリ）は検索クロール自体を禁止し、
// app-lp.zero-maze.com（製品紹介LP）のみ許可する。
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";

  if (host === LP_HOSTNAME) {
    return {
      rules: { userAgent: "*", allow: "/" },
      sitemap: `https://${LP_HOSTNAME}/sitemap.xml`,
    };
  }

  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
