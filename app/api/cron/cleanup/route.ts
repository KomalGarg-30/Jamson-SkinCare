import { and, eq, isNotNull, lt, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLogs, cartItems, emailOtps, orders, passwordResetTokens, payments, rateLimitBuckets, users, webhookEvents } from "@/db/schema";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { markOrderPaid, razorpayClient, releaseReservedStock } from "@/lib/payment-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function expirePendingOrders() {
  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return { expired: 0, recovered: 0 };
  const now = new Date();
  const pending = await db.select({
    orderId: orders.id, providerOrderId: payments.providerOrderId,
  }).from(orders).innerJoin(payments, eq(payments.orderId, orders.id))
    .where(and(eq(orders.status, "pending_payment"), lt(orders.reservedUntil, now), isNotNull(orders.reservedUntil)));
  let expired = 0;
  let recovered = 0;
  for (const order of pending) {
    if (order.providerOrderId) {
      const gatewayPayments = await razorpayClient().orders.fetchPayments(order.providerOrderId) as { items?: Array<{ id?: string; status?: string; amount?: number; currency?: string; method?: string }> };
      const paid = gatewayPayments.items?.find((payment) => payment.status === "captured" || payment.status === "authorized");
      if (paid?.id) {
        if (paid.status === "authorized") {
          await razorpayClient().payments.capture(paid.id, paid.amount || 0, env.CURRENCY);
        }
        const result = await markOrderPaid({
          providerOrderId: order.providerOrderId, providerPaymentId: paid.id,
          method: paid.method, source: "reconciliation",
        });
        if (result.state === "paid" || result.state === "already_paid") recovered++;
        continue;
      }
    }
    await db.transaction(async (tx) => {
      const [cancelled] = await tx.update(orders).set({
        status: "cancelled", paymentStatus: "expired", reservedUntil: null, updatedAt: now,
      }).where(and(eq(orders.id, order.orderId), eq(orders.status, "pending_payment"))).returning({ id: orders.id });
      if (!cancelled) return;
      await releaseReservedStock(tx, order.orderId);
      await tx.update(payments).set({ status: "expired", updatedAt: now }).where(eq(payments.orderId, order.orderId));
      expired++;
    });
  }
  return { expired, recovered };
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const now = new Date();
    const expiry = await expirePendingOrders();
    const cartCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const webhookCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const pendingSignupCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [resetTokens, carts, limits, events, otps, pendingUsers] = await Promise.all([
      db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now)).returning({ id: passwordResetTokens.id }),
      db.delete(cartItems).where(lt(cartItems.updatedAt, cartCutoff)).returning({ id: cartItems.id }),
      db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, now)).returning({ key: rateLimitBuckets.key }),
      db.delete(webhookEvents).where(lt(webhookEvents.createdAt, webhookCutoff)).returning({ eventId: webhookEvents.eventId }),
      db.delete(emailOtps).where(or(lt(emailOtps.expiresAt, now), isNotNull(emailOtps.usedAt))).returning({ id: emailOtps.id }),
      db.delete(users).where(and(eq(users.emailVerified, false), lt(users.createdAt, pendingSignupCutoff))).returning({ id: users.id }),
    ]);
    const retentionDays = getEnv().AUDIT_LOG_RETENTION_DAYS;
    const auditRows = retentionDays ? (await db.delete(auditLogs).where(lt(auditLogs.createdAt, new Date(now.getTime() - retentionDays * 86400000))).returning({ id: auditLogs.id })).length : 0;
    return NextResponse.json({
      status: "ok",
      expiredPayments: expiry,
      deleted: { passwordResetTokens: resetTokens.length, emailOtps: otps.length, pendingSignups: pendingUsers.length, staleCartItems: carts.length, rateLimits: limits.length, webhookEvents: events.length, auditLogs: auditRows },
    });
  } catch (error) {
    console.error("Scheduled cleanup failed:", { name: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Cleanup could not be completed." }, { status: 500 });
  }
}
