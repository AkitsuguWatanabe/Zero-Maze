"use client";

import { useEffect, useState } from "react";

type FeedbackData = {
  what: string;
  deadline: string | null;
  estimatedHours: string | null;
  assigneeName: string | null;
  feedbackStatus: "ok" | "unclear" | null;
  feedbackComment: string | null;
};

export function FeedbackClient({ token }: { token: string }) {
  const [data, setData] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/feedback/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d: FeedbackData | null) => {
        if (d) setData(d);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(status: "ok" | "unclear") {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/feedback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment: status === "unclear" ? comment.trim() : undefined }),
      });
      if (!res.ok) throw new Error();
      setData((prev) =>
        prev ? { ...prev, feedbackStatus: status, feedbackComment: status === "unclear" ? comment.trim() || null : null } : prev,
      );
      setShowCommentBox(false);
    } catch {
      setSubmitError("送信に失敗しました。しばらくしてから再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="text-center text-sm text-muted-foreground">読み込み中…</div>;
  }

  if (notFound || !data) {
    return (
      <div className="rounded-sm border border-border bg-card p-8 shadow-paper text-center">
        <h1 className="font-serif text-xl font-semibold">リンクが見つかりません</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          このリンクは無効になっているか、URLが正しくない可能性があります。
        </p>
      </div>
    );
  }

  if (data.feedbackStatus) {
    return (
      <div className="rounded-sm border border-border bg-card p-8 shadow-paper">
        <div className="text-xs uppercase tracking-widest text-accent">Feedback</div>
        <h1 className="mt-2 font-serif text-xl font-semibold">回答済みです</h1>
        <div className="mt-4 rounded-sm bg-muted/40 px-4 py-3 text-sm text-muted-foreground" title={data.what}>
          {data.what}
        </div>
        <p className="mt-4 text-sm">
          {data.feedbackStatus === "ok" ? (
            <span className="font-medium">「承知しました」で回答済みです。</span>
          ) : (
            <>
              <span className="font-medium">「確認させてください」で回答済みです。</span>
              {data.feedbackComment && (
                <span className="mt-2 block rounded-sm border border-border bg-muted/30 px-3 py-2 text-muted-foreground">
                  {data.feedbackComment}
                </span>
              )}
            </>
          )}
        </p>
        <div className="mt-4 rounded-sm border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          ご回答ありがとうございました。この画面はこのまま閉じていただいて問題ありません。
        </div>
        <p className="mt-4 text-xs text-muted-foreground">回答内容を変更したい場合は、下のボタンから再度送信できます。</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => submit("ok")}
            disabled={submitting}
            className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
          >
            承知しました、に変更
          </button>
          <button
            onClick={() => setShowCommentBox(true)}
            disabled={submitting}
            className="rounded-sm border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
          >
            確認させてください、に変更
          </button>
        </div>
        {showCommentBox && (
          <div className="mt-3 space-y-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="どのような点を確認したいか、ひとことで構いません"
              className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
            />
            <button
              onClick={() => submit("unclear")}
              disabled={submitting}
              className="w-full rounded-sm bg-foreground py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? "送信中…" : "この内容で送信"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card p-8 shadow-paper">
      <div className="text-xs uppercase tracking-widest text-accent">Feedback</div>
      <h1 className="mt-2 font-serif text-xl font-semibold">
        {data.assigneeName ? `${data.assigneeName} 様` : "ご確認ください"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        以下の指示について、着手前に状況を教えてください。
      </p>

      <div className="mt-4 rounded-sm bg-muted/40 px-4 py-3 text-sm" title={data.what}>
        {data.what}
      </div>
      {(data.deadline || data.estimatedHours) && (
        <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          {data.deadline && <span>期限：{data.deadline}</span>}
          {data.estimatedHours && <span>見込み工数：{data.estimatedHours}</span>}
        </p>
      )}

      {!showCommentBox ? (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => submit("ok")}
            disabled={submitting}
            className="flex-1 rounded-sm bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? "送信中…" : "承知しました"}
          </button>
          <button
            onClick={() => setShowCommentBox(true)}
            disabled={submitting}
            className="flex-1 rounded-sm border border-border py-2.5 text-sm font-medium transition-colors hover:border-foreground/40 disabled:opacity-40"
          >
            確認させてください
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <label className="text-xs font-medium text-muted-foreground">
            どのような点を確認したいか、ひとことで構いません（空欄でも送信できます）
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="例：期限までにどの範囲まで終わらせればよいか確認させてください"
            className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowCommentBox(false)}
              disabled={submitting}
              className="rounded-sm border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-40"
            >
              戻る
            </button>
            <button
              onClick={() => submit("unclear")}
              disabled={submitting}
              className="flex-1 rounded-sm bg-foreground py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? "送信中…" : "この内容で送信"}
            </button>
          </div>
        </div>
      )}

      {submitError && <p className="mt-3 text-xs text-destructive">{submitError}</p>}
    </div>
  );
}