import type { MetadataRoute } from "next";

// app.zero-maze.com（ログイン前提の本体アプリ）は検索クロール自体を禁止する。
// 製品紹介LPはapp-lp.zero-maze.com（別プロジェクトzero-maze-lpに分離済み）が担う。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
