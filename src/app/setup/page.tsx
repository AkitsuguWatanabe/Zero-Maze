"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth";
import { SiteFooter } from "@/components/SiteHeader";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If users already exist, this page is unavailable — send to login.
  useEffect(() => {
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d: { hasUsers?: boolean }) => {
        if (d.hasUsers) router.replace("/login");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("パスワードが一致しません");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で設定してください");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "作成に失敗しました");

      // Auto-login as the new admin.
      await signIn(email, password);
      window.location.href = "/workflow";
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        確認中…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-gradient-ink shadow-ink">
              <span className="font-serif text-xl font-semibold text-primary-foreground">指</span>
            </div>
            <div className="leading-tight">
              <div className="font-serif text-[16px] font-semibold tracking-tight">Zero-Maze</div>
              <div className="text-[10px] tracking-[0.15em] text-muted-foreground">迷わない指示を、設計する。</div>
            </div>
          </div>

          <div className="rounded-sm border border-border bg-card p-8 shadow-paper">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 rounded bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              初回セットアップ
            </div>

            <h1 className="font-serif text-2xl font-semibold">管理者アカウントの作成</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              最初の管理者アカウントを作成します。このアカウントでログイン後、他のユーザーを追加できます。
            </p>

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
                  placeholder="admin@yourcompany.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                  パスワード <span className="text-muted-foreground/60">（8文字以上）</span>
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="confirm">
                  パスワード（確認）
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-sm bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {loading ? "作成中…" : "管理者アカウントを作成してログイン"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            すでにアカウントをお持ちの方は
            <a href="/login" className="ml-1 underline-offset-4 hover:underline">ログインページへ</a>
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
