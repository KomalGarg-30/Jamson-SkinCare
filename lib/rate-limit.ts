import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { rateLimitBuckets } from "@/db/schema";
import { db } from "@/lib/db";

const redisScript = "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return {count, redis.call('TTL', KEYS[1])}";

async function redisRateLimit(key: string, limit: number, windowMs: number): Promise<boolean | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(["EVAL", redisScript, "1", `jamson:rl:${createHash("sha256").update(key).digest("hex")}`, String(Math.ceil(windowMs / 1000))]),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Upstash returned HTTP ${response.status}`);
    const result = await response.json() as { result?: unknown };
    if (!Array.isArray(result.result) || typeof result.result[0] !== "number") {
      throw new Error("Upstash returned an invalid rate-limit response.");
    }
    return result.result[0] <= limit;
  } catch (error) {
    console.error("Upstash rate limiting failed; using the PostgreSQL fallback.", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

async function databaseRateLimit(key: string, limit: number, windowMs: number) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const [bucket] = await db.insert(rateLimitBuckets).values({
    key, count: 1, resetAt, updatedAt: now,
  }).onConflictDoUpdate({
    target: rateLimitBuckets.key,
    set: {
      count: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${now} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
      resetAt: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${now} THEN ${resetAt} ELSE ${rateLimitBuckets.resetAt} END`,
      updatedAt: now,
    },
  }).returning({ count: rateLimitBuckets.count });
  return Boolean(bucket && bucket.count <= limit);
}

export async function rateLimit(key: string, limit = 8, windowMs = 60_000) {
  const redisResult = await redisRateLimit(key, limit, windowMs);
  return redisResult ?? databaseRateLimit(key, limit, windowMs);
}

export async function rateLimitMany(keys: string[], limit: number, windowMs: number) {
  let allowed = true;
  for (const key of keys) {
    if (!await rateLimit(key, limit, windowMs)) allowed = false;
  }
  return allowed;
}
