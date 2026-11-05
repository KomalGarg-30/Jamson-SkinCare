import { lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLogs, cartItems, passwordResetTokens, rateLimitBuckets, webhookEvents } from "@/db/schema";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const now = new Date();
    const cartCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const webhookCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const [resetTokens, carts, limits, events] = await Promise.all([
      db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now)).returning({ id: passwordResetTokens.id }),
      db.delete(cartItems).where(lt(cartItems.updatedAt, cartCutoff)).returning({ id: cartItems.id }),
      db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, now)).returning({ key: rateLimitBuckets.key }),
      db.delete(webhookEvents).where(lt(webhookEvents.createdAt, webhookCutoff)).returning({ eventId: webhookEvents.eventId }),
    ]);

    const retentionDays = getEnv().AUDIT_LOG_RETENTION_DAYS;
    let auditRows = 0;
    if (retentionDays) {
      const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
      auditRows = (await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff)).returning({ id: auditLogs.id })).length;
    }

    return NextResponse.json({
      status: "ok",
      deleted: { passwordResetTokens: resetTokens.length, staleCartItems: carts.length, rateLimits: limits.length, webhookEvents: events.length, auditLogs: auditRows },
    });
  } catch (error) {
    console.error("Scheduled cleanup failed:", error);
    return NextResponse.json({ error: "Cleanup could not be completed." }, { status: 500 });
  }
}
