"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";
import { SiteFooter } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Suspense } from "react";

type IdCheckStatus = "idle" | "checking" | "found" | "not_found" | "error";
type DevStep = "id" | "password" | "confirm";
type ConfirmInfo = { email: string; tenantName: string; teamName: string | null; displayName: string };

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/workflow";

  // --- 13-4 新ログイン方式（第一段階：企業ID＋ログインID） ---
  const [tenantCode, setTenantCode] = useState("");
  const [loginId, setLoginId] = useState("");
  const [idCheckStatus, setIdCheckStatus] = useState<IdCheckStatus>("idle");

  // --- 第二段階：パスワード入力・確認画面 ---
  const [devStep, setDevStep] = useState<DevStep>("id");
  const [devPassword, setDevPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [confirmInfo, setConfirmInfo] = useState<ConfirmInfo | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  useEffect(() => {
    if (devStep !== "id") return;
    const trimmedTenantCode = tenantCode.trim();
    const trimmedLoginId = loginId.trim();

    if (!trimmedTenantCode || !trimmedLoginId) {
      setIdCheckStatus("idle");
      return;
    }
    if (!/^[A-Za-z0-9]+$/.test(trimmedLoginId)) {
      setIdCheckStatus("error");
      return;
    }

    setIdCheckStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/check-login-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantCode: trimmedTenantCode, loginId: trimmedLoginId }),
        });
        const data = await res.json();
        setIdCheckStatus(data.exists ? "found" : "not_found");
      } catch {
        setIdCheckStatus("error");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [tenantCode, loginId, devStep]);

  async function handleDevVerify() {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch("/api/auth/verify-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantCode: tenantCode.trim(),
          loginId: loginId.trim(),
          password: devPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setVerifyError(data.error ?? "確認に失敗しました");
        return;
      }
      setConfirmInfo({
        email: data.email,
        tenantName: data.tenantName,
        teamName: data.teamName,
        displayName: data.displayName,
      });
      setDevStep("confirm");
    } catch {
      setVerifyError("確認に失敗しました。通信環境をご確認ください");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDevConfirmLogin() {
    if (!confirmInfo) return;
    setConfirmLoading(true);
    setVerifyError(null);
    try {
      await signIn(confirmInfo.email, devPassword);
      window.location.href = next;
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : "ログインに失敗しました");
      setConfirmLoading(false);
    }
  }

  function handleDevBackToId() {
    setDevStep("id");
    setDevPassword("");
    setVerifyError(null);
    setConfirmInfo(null);
  }

  function handleDevBackToPassword() {
    setDevStep("password");
    setConfirmInfo(null);
    setVerifyError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signIn(email, password);

      // 13-2: 企業が凍結中の場合はログインを成立させない（顧客管理者・チーム管理者・
      // メンバー全員が対象）。認証自体は成功しているため、ここで検知したら即座に
      // サインアウトし、ログイン失敗として扱う。
      const meRes = await fetch("/api/me");
      const me = await meRes.json();
      if (me?.tenantFrozen) {
        await signOut();
        setError("この企業は現在利用停止中のため、ログインできません。管理者にお問い合わせください。");
        setLoading(false);
        return;
      }

      // 13-5 4-8: 本番切り替え。企業（テナント）に所属するユーザー（顧客管理者・
      // チーム管理者・メンバー）は、企業ID＋ログインID＋パスワードの新方式でログイン
      // する。tenantIdを持たない代理店管理者（reseller_admin）は設計上の制約により
      // 対象外で、こちらのメールアドレス方式を引き続き利用する。
      if (me?.tenantId) {
        await signOut();
        setError("企業に所属するユーザーの方は、上部の「企業ID・ログインID・パスワード」からログインしてください。");
        setLoading(false);
        return;
      }

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

            {searchParams.get("timeout") === "1" && (
              <div className="mt-4 rounded-sm border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
                一定時間操作がなかったため、自動的にログアウトしました。もう一度ログインしてください。
              </div>
            )}

            {/* --- ログイン方式（企業ID＋ログインID＋パスワード） --- */}
            <div className="mt-6 rounded-sm border border-border bg-muted/30 p-4">
              {devStep === "id" && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="tenantCode">
                      企業ID
                    </label>
                    <Input
                      id="tenantCode"
                      type="text"
                      value={tenantCode}
                      onChange={(e) => setTenantCode(e.target.value)}
                      className="mt-1 py-2.5"
                      placeholder="例：Ab3xQ9kLp2"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="loginId">
                      ログインID
                    </label>
                    <Input
                      id="loginId"
                      type="text"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      className="mt-1 py-2.5"
                      placeholder="英数字のみ"
                    />
                  </div>
                  <div className="text-xs">
                    {idCheckStatus === "checking" && <span className="text-muted-foreground">確認中…</span>}
                    {idCheckStatus === "found" && <span className="text-emerald-600">✓ 確認できました</span>}
                    {idCheckStatus === "not_found" && (
                      <span className="text-destructive">その企業ID・ログインIDの組み合わせが見つかりません</span>
                    )}
                    {idCheckStatus === "error" && (
                      <span className="text-destructive">ログインIDは英数字のみで入力してください</span>
                    )}
                  </div>
                  <Button
                    type="button"
                    disabled={idCheckStatus !== "found"}
                    onClick={() => setDevStep("password")}
                    className="w-full"
                  >
                    次へ
                  </Button>
                </div>
              )}

              {devStep === "password" && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    企業ID：{tenantCode} ／ ログインID：{loginId}{" "}
                    <button type="button" onClick={handleDevBackToId} className="ml-1 underline underline-offset-2">
                      変更する
                    </button>
                  </p>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="devPassword">
                      パスワード
                    </label>
                    <Input
                      id="devPassword"
                      type="password"
                      value={devPassword}
                      onChange={(e) => setDevPassword(e.target.value)}
                      className="mt-1 py-2.5"
                      placeholder="••••••••"
                    />
                  </div>
                  {verifyError && <p className="text-xs text-destructive">{verifyError}</p>}
                  <Button
                    type="button"
                    disabled={verifying || !devPassword}
                    onClick={handleDevVerify}
                    className="w-full"
                  >
                    {verifying ? "確認中…" : "次へ"}
                  </Button>
                </div>
              )}

              {devStep === "confirm" && confirmInfo && (
                <div className="mt-3 space-y-3">
                  <div className="rounded-sm border border-border bg-background px-3 py-3 text-sm">
                    <p className="font-medium">{confirmInfo.tenantName}</p>
                    {confirmInfo.teamName && <p className="text-muted-foreground">{confirmInfo.teamName}</p>}
                    <p className="mt-1">{confirmInfo.displayName} 様</p>
                  </div>
                  <p className="text-xs text-muted-foreground">この内容でよろしいですか？</p>
                  {verifyError && <p className="text-xs text-destructive">{verifyError}</p>}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleDevBackToPassword} className="w-1/3">
                      戻る
                    </Button>
                    <Button
                      type="button"
                      disabled={confirmLoading}
                      onClick={handleDevConfirmLogin}
                      className="w-2/3"
                    >
                      {confirmLoading ? "ログイン中…" : "ログイン"}
                    </Button>
                  </div>
                </div>
              )}

            </div>

            {error && (
              <div className="mt-4 rounded-sm border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <details className="mt-6 group">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground underline-offset-4 hover:underline">
                代理店・スーパー管理者の方はこちら（メールアドレスでログイン）
              </summary>
              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                    メールアドレス
                  </label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 py-2.5"
                    placeholder="your@company.com"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                    パスワード
                  </label>
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 py-2.5"
                    placeholder="••••••••"
                  />
                </div>
                <Button type="submit" disabled={loading} className="mt-2 w-full">
                  {loading ? "ログイン中…" : "ログイン"}
                </Button>
              </form>
            </details>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            アカウントの発行・パスワードリセットは管理者にお問い合わせください。
            <br />
            <a href="/forgot-password" className="mt-1 inline-block underline underline-offset-4 hover:no-underline">
              パスワードをお忘れの方はこちら
            </a>
            <br />
                <a href="/forgot-login-id" className="mt-1 inline-block underline underline-offset-4 hover:opacity-70">
                  ログインIDをお忘れの方はこちら
                </a>
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