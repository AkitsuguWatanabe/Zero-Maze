// 使い方:
//   1. Supabase Dashboard → Project Settings → API → service_role key（secret）をコピー
//   2. このファイルと同じフォルダで、PowerShellから以下を実行（キーはこのターミナルにだけ入力し、
//      Claudeとのチャットには絶対に貼り付けないこと）
//
//      $env:SUPABASE_SERVICE_ROLE_KEY = "ここに service_role キーを貼る"
//      node scripts/generate-recovery-link.mjs a_watanabe@gs-group.jp
//
//   3. 出力された action_link を、ブラウザで直接開く（ログアウト状態で）
//      → 自動的にセッションが作られ、パスワード再設定画面に進める

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ejndtrzbdxfzihftnuaz.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];

if (!serviceRoleKey) {
  console.error("環境変数 SUPABASE_SERVICE_ROLE_KEY が設定されていません。");
  process.exit(1);
}
if (!email) {
  console.error("使い方: node generate-recovery-link.mjs <email>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.generateLink({
  type: "recovery",
  email,
  options: {
    redirectTo: "https://app.zero-maze.com/auth/callback?next=/update-password",
  },
});

if (error) {
  console.error("エラー:", error.message);
  process.exit(1);
}

console.log("\n以下のリンクをブラウザで直接開いてください（ログアウト状態で）:\n");
console.log(data.properties.action_link);
console.log("\n開くと自動的にパスワード再設定画面に進みます。");
