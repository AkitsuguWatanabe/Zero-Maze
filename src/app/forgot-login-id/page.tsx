"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteHeader";

export default function ForgotLoginIdPage() {
  const [tenantCode, setTenantCode] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-login-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantCode: tenantCode.trim(),
          email: email.trim(),
        }),
      });
      if (!res.ok) {
        throw new Error("送信に失敗しました");
      }
      // 該当有無に関わらず同じ表示にする（13-4の方針）
      setDone(true);
    } catch (err) {
      console.error("Login ID reminder request failed:", err);
      const raw = err instanceof Error ? err.message.trim() : "";
      setError(
        raw && raw !== "{}" && raw !== "[object Object]"
          ? raw
          : "送信に失敗しました。しばらくしてから再度お試しください。",
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
            <h1 className="font-serif text-2xl font-semibold">ログインIDをお忘れの方</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              企業IDとご登録のメールアドレスを入力してください。該当するログインIDをメールでお送りします。
            </p>

            {done ? (
              <div className="mt-6 rounded-sm border border-border bg-muted/30 px-4 py-3 text-sm">
                入力された内容に該当するログインIDをメールでお送りしました（該当するアカウントが存在する場合）。メールをご確認ください。
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="tenantCode">
                    企業ID
                  </label>
                  <input
                    id="tenantCode"
                    type="text"
                    required
                    value={tenantCode}
                    onChange={(e) => setTenantCode(e.target.value)}
                    className="mt-1 block w-full rounded-sm border border-border bg-background px-3 py-2.5 text-sm focus:border-foreground focus:outline-none"
                    placeholder="企業ID"
                  />
                </div>
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
                  disabled={loading || !tenantCode.trim() || !email.trim()}
                  className="mt-2 w-full rounded-sm bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {loading ? "送信中…" : "ログインIDを送る"}
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