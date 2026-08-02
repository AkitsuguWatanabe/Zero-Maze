import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const limiters = new Map<string, Ratelimit>();

function getLimiter(routeKey: string, max: number, windowSeconds: number): Ratelimit {
  const cacheKey = `${routeKey}:${max}:${windowSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`),
      prefix: `ratelimit:${routeKey}`,
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * IPベースのレート制限。上限を超えた場合は429レスポンスを返す。
 * Upstash未設定（開発環境等）でも本体機能を止めないよう、エラー時はfail-openにする。
 */
export async function rateLimitOrReject(
  req: NextRequest,
  routeKey: string,
  max: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null;
  }
  try {
    const ip = getClientIp(req);
    const limiter = getLimiter(routeKey, max, windowSeconds);
    const { success } = await limiter.limit(`${routeKey}:${ip}`);
    if (!success) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらく時間をおいて再度お試しください" },
        { status: 429 },
      );
    }
    return null;
  } catch (err) {
    console.error("[rateLimitOrReject]", err);
    return null;
  }
}
