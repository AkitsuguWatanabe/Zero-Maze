"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth";
import { SiteFooter } from "@/components/SiteHeader";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      // メールアドレスが実在するかどうかに関わらず同じ表示にする
      // （13-4の方針：実在有無を推測されないようにするため）
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm">
          <div className="rounded-sm border border-border bg-card p-8 shadow-paper">
            <h1 className="font-serif text-2xl font-semibold">パスワードをお忘れの方</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              登録済みのメールアドレスを入力してください。再設定用のリンクをお送りします。
            </p>

            {done ? (
              <div className="mt-6 rounded-sm border border-border bg-muted/30 px-4 py-3 text-sm">
                入力されたメールアドレス宛に、パスワード再設定用のメールをお送りしました（該当するアカウントが存在する場合）。メールをご確認ください。
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                    メールアドレス
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
                    placeholder="your@company.com"
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="mt-2 w-full rounded-sm bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {loading ? "送信中…" : "再設定メールを送る"}
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link href="/login" className="underline underline-offset-4">
              ログイン画面に戻る
            </Link>
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}