import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

type Bucket = { count: number; expiresAt: number };
export type RateLimitResult = { allowed: boolean; retryAfter: number; unavailable: boolean };

const globalRateState = globalThis as typeof globalThis & { portfolioLocalRateLimits?: Map<string, Bucket> };
const localBuckets = globalRateState.portfolioLocalRateLimits ?? new Map<string, Bucket>();
globalRateState.portfolioLocalRateLimits = localBuckets;

const redisScript = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return n";

function safeKey(scope: string) {
  return createHash("sha256").update(scope).digest("hex");
}

function localLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (localBuckets.size > 5000) {
    for (const [oldKey, bucket] of localBuckets) if (bucket.expiresAt <= now) localBuckets.delete(oldKey);
  }
  const bucket = localBuckets.get(key);
  if (!bucket || bucket.expiresAt <= now) {
    localBuckets.set(key, { count: 1, expiresAt: now + windowMs });
    return { allowed: true, retryAfter: Math.ceil(windowMs / 1000), unavailable: false };
  }
  if (bucket.count >= limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)), unavailable: false };
  bucket.count += 1;
  return { allowed: true, retryAfter: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)), unavailable: false };
}

/** Shared Redis rate limiting in production. In-memory fallback is deliberately development-only. */
export async function takeRateLimit(scope: string, limit: number, windowMs = 60_000): Promise<RateLimitResult> {
  const key = `portfolioai:rl:${safeKey(scope)}`;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, "");
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisUrl || !redisToken) {
    if (process.env.NODE_ENV === "production") return { allowed: false, retryAfter: 60, unavailable: true };
    return localLimit(key, limit, windowMs);
  }

  try {
    const response = await fetch(`${redisUrl}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
      body: JSON.stringify([["EVAL", redisScript, "1", key, String(windowMs)]]),
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error("Redis request failed");
    const result = await response.json() as { result?: unknown; error?: string }[];
    const count = Number(result[0]?.result);
    if (!Number.isFinite(count)) throw new Error("Redis returned an invalid limit count");
    return { allowed: count <= limit, retryAfter: Math.ceil(windowMs / 1000), unavailable: false };
  } catch {
    if (process.env.NODE_ENV !== "production") return localLimit(key, limit, windowMs);
    return { allowed: false, retryAfter: 60, unavailable: true };
  }
}

export function requestAddressScope(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
  return safeKey(address);
}

export async function rateLimitResponse(request: Request, scope: string, limit: number, windowMs = 60_000) {
  const result = await takeRateLimit(scope, limit, windowMs);
  if (result.allowed) return null;
  const status = result.unavailable ? 503 : 429;
  const message = result.unavailable ? "Rate limiting is unavailable; try again later." : "Too many requests. Wait briefly and try again.";
  return NextResponse.json({ error: message }, { status, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" } });
}
