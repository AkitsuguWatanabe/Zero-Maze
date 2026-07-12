"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";

// 未認証でもアクセスできる画面。ここではアイドル監視・タイムアウトを行わない。
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/forgot-password",
  "/forgot-login-id",
  "/update-password",
  "/feedback",
  "/lp",
];

const ACTIVITY_STORAGE_KEY = "zero-maze:last-activity-at";
const DEFAULT_TIMEOUT_MINUTES = 30;
const CHECK_INTERVAL_MS = 30_000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;

/**
 * 4-6：セッションタイムアウト（初期値30分・ユーザーごとに調整可能）。
 * 一定時間操作がない場合、自動的にログアウトしてログイン画面へ強制的に遷移させる。
 * タイムアウト時間はuser_roles.session_timeout_minutes（/api/me経由）に従う。
 */
export function SessionTimeoutGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const timeoutMinutesRef = useRef(DEFAULT_TIMEOUT_MINUTES);

  const isPublicPath = PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p)) || pathname === "/";

  useEffect(() => {
    if (isPublicPath) return;

    let cancelled = false;

    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.sessionTimeoutMinutes === "number") {
          timeoutMinutesRef.current = data.sessionTimeoutMinutes;
        }
      })
      .catch(() => {
        // 取得できない場合はデフォルト（30分）のまま
      });

    function touch() {
      try {
        window.sessionStorage.setItem(ACTIVITY_STORAGE_KEY, String(Date.now()));
      } catch {
        // プライベートブラウジング等でsessionStorageが使えない場合は無視
      }
    }
    touch();

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, touch, { passive: true }));

    const interval = setInterval(async () => {
      let lastActivity = Date.now();
      try {
        const stored = window.sessionStorage.getItem(ACTIVITY_STORAGE_KEY);
        if (stored) lastActivity = Number(stored);
      } catch {
        // ignore
      }

      const idleMinutes = (Date.now() - lastActivity) / 60000;
      if (idleMinutes >= timeoutMinutesRef.current) {
        clearInterval(interval);
        try {
          await signOut();
        } catch {
          // ログアウトに失敗しても画面遷移は行う
        }
        window.location.href = "/login?timeout=1";
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, touch));
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublicPath, pathname]);

  return null;
}