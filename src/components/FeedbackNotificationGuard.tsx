"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type FeedbackItem = {
  id: string;
  what: string;
  assignee_name: string | null;
  feedback_status: "ok" | "unclear";
  feedback_comment: string | null;
  feedback_at: string;
};

// 未認証でもアクセスできる画面。ここでは通知ポーリングを行わない。
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/forgot-password",
  "/forgot-login-id",
  "/update-password",
  "/feedback",
  "/setup",
];

const POLL_INTERVAL_MS = 60_000;

/**
 * 18-2：担当者からのフィードバック回答を、指示者がどの画面にいても
 * ポップアップで知らせる。「確認」ボタンを押すまでは同じ内容が
 * 再表示され続ける（Escapeや背景クリックでは確認済みにしない）。
 */
export function FeedbackNotificationGuard() {
  const pathname = usePathname();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [open, setOpen] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const openRef = useRef(false);
  openRef.current = open;

  const isPublicPath = PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p)) || pathname === "/";

  const poll = useCallback(async () => {
    if (openRef.current) return; // 表示中は内容を差し替えない
    try {
      const res = await fetch("/api/notifications/feedback");
      if (!res.ok) return;
      const data: FeedbackItem[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setItems(data);
        setOpen(true);
      }
    } catch {
      // 取得できなくても致命的ではないため無視
    }
  }, []);

  useEffect(() => {
    if (isPublicPath) return;
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isPublicPath, poll]);

  async function acknowledge() {
    setAcknowledging(true);
    try {
      await fetch("/api/notifications/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: items.map((i) => i.id) }),
      });
    } catch {
      // 確認済み化に失敗しても、次回ポーリングで再表示されるだけなので致命的ではない
    } finally {
      setAcknowledging(false);
      setOpen(false);
      setItems([]);
    }
  }

  if (isPublicPath || items.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogContent className="max-w-md">
        <DialogTitle>担当者から回答がありました</DialogTitle>
        <DialogDescription>以下の指示について、担当者からの回答が届いています。</DialogDescription>
        <div className="mt-2 max-h-80 space-y-3 overflow-y-auto">
          {items.map((item) => (
            <div key={item.id} className="rounded-sm border border-border bg-muted/30 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.assignee_name ?? "担当者"}</span>
                <span className={item.feedback_status === "ok" ? "text-xs font-medium text-emerald-700" : "text-xs font-medium text-rose-700"}>
                  {item.feedback_status === "ok" ? "承知しました" : "確認させてください"}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground" title={item.what}>{item.what}</p>
              {item.feedback_comment && (
                <p className="mt-1 rounded-sm border border-border bg-background px-2 py-1.5 text-muted-foreground">
                  {item.feedback_comment}
                </p>
              )}
            </div>
          ))}
        </div>
        <Button onClick={acknowledge} disabled={acknowledging} className="mt-2 w-full">
          {acknowledging ? "処理中…" : "確認"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
