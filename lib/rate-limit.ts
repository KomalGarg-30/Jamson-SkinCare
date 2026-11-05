import { sql } from "drizzle-orm";
import { rateLimitBuckets } from "@/db/schema";
import { db } from "@/lib/db";

export async function rateLimit(key: string, limit = 8, windowMs = 60_000) {
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
