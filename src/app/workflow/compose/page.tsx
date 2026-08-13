"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteHeader";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { detectPii, redactPii, PII_KIND_LABEL, type PiiMatch } from "@/lib/pii-guard";
import { COMPOSED_DRAFT_STORAGE_KEY } from "@/lib/mock-data";
import type { AssigneeRank, ComposeDraft, ComposeMessage, ComposeTurnResult } from "@/lib/mock-data";

const OPENING_MESSAGE =
  "どんな業務について、何を・どこまで行ってほしいか、まずはざっくり教えてください。";

const INITIAL_MESSAGES: ComposeMessage[] = [{ role: "assistant", content: OPENING_MESSAGE }];
const VALID_RANKS: AssigneeRank[] = ["A", "B", "C", "D"];

// useSearchParams()を使うページはSuspenseバウンダリでラップしないと本番
// ビルド（next build）の静的prerenderでエラーになる（npm run devでは再現しない）。
export default function ComposePage() {
  return (
    <Suspense fallback={null}>
      <ComposeForm />
    </Suspense>
  );
}

function ComposeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rank: AssigneeRank = VALID_RANKS.includes(searchParams.get("rank") as AssigneeRank)
    ? (searchParams.get("rank") as AssigneeRank)
    : "B";
  const [messages, setMessages] = useState<ComposeMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [piiConfirm, setPiiConfirm] = useState<PiiMatch[] | null>(null);
  const done = draft !== null;

  async function handleSend(opts?: { skipPiiCheck?: boolean }) {
    if (loading || done) return;
    const text = input.trim();
    if (!text) return;

    if (!opts?.skipPiiCheck) {
      const matches = detectPii(text);
      if (matches.length > 0) {
        setPiiConfirm(matches);
        return;
      }
    }
    setPiiConfirm(null);

    const nextMessages: ComposeMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, rank }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "応答の生成に失敗しました");
      const result = data as ComposeTurnResult;
      setMessages((prev) => [...prev, { role: "assistant", content: result.message }]);
      if (result.type === "done" && result.draft) {
        setDraft(result.draft);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "応答の生成に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function handleRestart() {
    setMessages(INITIAL_MESSAGES);
    setInput("");
    setError(null);
    setDraft(null);
    setPiiConfirm(null);
  }

  function handlePiiReplace() {
    if (!piiConfirm) return;
    setInput((prev) => redactPii(prev, piiConfirm));
    setPiiConfirm(null);
    // Don't auto-resend — the replacement is best-effort, so the user
    // reviews the result before sending it themselves.
  }

  function handlePiiSendAsIs() {
    setPiiConfirm(null);
    handleSend({ skipPiiCheck: true });
  }

  function handleUseDraft() {
    if (!draft) return;
    sessionStorage.setItem(COMPOSED_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    router.push("/workflow");
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
        <div>
          <Link href="/workflow" className="text-xs text-muted-foreground hover:text-foreground">
            ← 指示概要入力に戻る
          </Link>
          <PageHeader
            eyebrow="AI対話"
            title="AIと相談しながら①作業概要を作る"
            description="いくつか質問に答えていくと、AIが①作業概要の下書きをまとめます。②背景以降は指示概要入力の画面でご自身で入力してください。"
            as="h1"
            size="md"
            className="mt-4"
          />
        </div>

        <div className="flex items-start gap-2 rounded-sm border-2 border-destructive/40 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive">
          <span className="mt-px shrink-0">🚫</span>
          <span>社名・氏名・メールアドレス・電話番号などの個人情報は入力しないでください。それらしき表記があれば、送信前に確認画面が表示されます。入力内容はAI（OpenAI）に送信されます。</span>
        </div>

        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-sm px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-foreground text-background"
                    : "border border-border bg-muted/40 text-foreground"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-sm border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground">
                考え中…
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-sm border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!done && (
          <div className="sticky bottom-0 -mx-6 space-y-2 border-t border-border bg-background px-6 py-3 sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
            {piiConfirm && (
              <div className="space-y-3 rounded-sm border-2 border-destructive/40 bg-destructive/5 p-4">
                <p className="text-sm font-semibold text-destructive">
                  ⚠ 個人情報・社名らしき表記が見つかりました
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                  {piiConfirm.map((m, i) => (
                    <li key={i}>
                      {PII_KIND_LABEL[m.kind]}：「{m.text}」
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  入力内容はAI（OpenAI）に送信されます。「A社」のような一般的な表記に置き換えることをおすすめします。
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="flex-1" onClick={handlePiiReplace}>一般的な表記に置き換える</Button>
                  <Button className="flex-1" variant="outline" onClick={handlePiiSendAsIs}>このまま送信する</Button>
                  <Button className="flex-1" variant="outline" onClick={() => setPiiConfirm(null)}>キャンセルして編集する</Button>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="ここに入力…（Enterで送信 / Shift+Enterで改行）"
                rows={2}
                disabled={loading}
                className="w-full resize-none rounded-sm border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus:border-foreground focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="shrink-0 rounded-sm bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                送信
              </button>
            </div>
          </div>
        )}

        {done && draft && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-sm border border-border bg-card p-4 shadow-paper">
              <p className="text-sm font-semibold text-foreground">✓ ①作業概要の下書きができました</p>
              <p className="whitespace-pre-wrap text-sm text-foreground">{draft.task_content}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={handleUseDraft}>
                ①作業概要欄に反映する
              </Button>
              <Button className="flex-1" variant="outline" onClick={handleRestart}>
                最初からやり直す
              </Button>
            </div>
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
