"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth";
import { SiteFooter } from "@/components/SiteHeader";
import { Suspense } from "react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/workflow";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      // Hard navigation — ensures session cookie is included in the next server request.
      // router.push() + router.refresh() causes a race condition where middleware
      // may check the session before the cookie is fully set.
      window.location.href = next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm">
          <div className="rounded-sm border border-border bg-card p-8 shadow-paper">
            <h1 className="font-serif text-2xl font-semibold">ログイン</h1>
            <p className="mt-1 text-sm text-muted-foreground">管理者からアカウントを発行してもらってください。</p>

            {error && (
              <div className="mt-4 rounded-sm border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

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
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                  パスワード
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-sm bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {loading ? "ログイン中…" : "ログイン"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            アカウントの発行・パスワードリセットは管理者にお問い合わせください。
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground/60">
            初めてお使いの方（ユーザー未登録）は
            <a href="/setup" className="ml-1 text-muted-foreground underline-offset-4 hover:underline">
              初回セットアップ
            </a>
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
