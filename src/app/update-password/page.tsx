"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/lib/auth";
import { SiteFooter } from "@/components/SiteHeader";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("パスワードは8文字以上で設定してください");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "更新に失敗しました。リンクの有効期限が切れている可能性があります",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm">
          <div className="rounded-sm border border-border bg-card p-8 shadow-paper">
            <h1 className="font-serif text-2xl font-semibold">新しいパスワードの設定</h1>

            {done ? (
              <div className="mt-6 rounded-sm border border-border bg-muted/30 px-4 py-3 text-sm">
                パスワードを更新しました。まもなくログイン画面に移動します。
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                    新しいパスワード
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
                    placeholder="8文字以上"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="confirmPassword">
                    新しいパスワード（確認）
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
                    placeholder="もう一度入力してください"
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-sm bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {loading ? "更新中…" : "パスワードを更新"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}