import { headers } from "next/headers";
import type { MetadataRoute } from "next";

// layout.tsx / middleware.ts / robots.tsのLP_HOSTNAMEと同じ値。変更する場合は全部直すこと。
const LP_HOSTNAME = "app-lp.zero-maze.com";

// app-lp.zero-maze.com（製品紹介LP）のみ掲載する。app.zero-maze.comは
// 検索対象外（robots.ts参照）のため空にする。
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get("host") ?? "";
  if (host !== LP_HOSTNAME) return [];

  return [
    {
      url: `https://${LP_HOSTNAME}/lp`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
