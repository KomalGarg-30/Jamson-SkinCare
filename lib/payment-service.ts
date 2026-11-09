import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { and, eq, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { cartItems, coupons, orderItems, orders, payments, products } from "@/db/schema";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { getEnv, requireEnv } from "@/lib/env";

export type PaymentSource = "verify" | "webhook" | "reconciliation";

type PaymentTransaction = PgTransaction<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export function razorpayClient() {
  return new Razorpay({
    key_id: requireEnv("RAZORPAY_KEY_ID"),
    key_secret: requireEnv("RAZORPAY_KEY_SECRET"),
  });
}

export function safeCompareHex(receivedValue: string, expected: Buffer) {
  if (!/^[a-f0-9]+$/i.test(receivedValue)) return false;
  const received = Buffer.from(receivedValue, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const expected = createHmac("sha256", requireEnv("RAZORPAY_KEY_SECRET"))
    .update(`${orderId}|${paymentId}`)
    .digest();
  return safeCompareHex(signature, expected);
}

export function verifyWebhookSignature(body: string, signature: string) {
  const expected = createHmac("sha256", requireEnv("RAZORPAY_WEBHOOK_SECRET")).update(body).digest();
  return safeCompareHex(signature, expected);
}

export async function finalizeReservedStock(tx: PaymentTransaction, orderId: string) {
  const items = await tx.select({ productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const item of items) {
    if (!item.productId) continue;
    const [updated] = await tx.update(products).set({
      stock: sql`${products.stock} - ${item.quantity}`,
      reservedStock: sql`${products.reservedStock} - ${item.quantity}`,
      updatedAt: new Date(),
    }).where(and(
      eq(products.id, item.productId),
      sql`${products.stock} >= ${item.quantity}`,
      sql`${products.reservedStock} >= ${item.quantity}`,
    )).returning({ id: products.id });
    if (!updated) throw new Error("Reserved stock is no longer available.");
  }
}

export async function releaseReservedStock(tx: PaymentTransaction, orderId: string) {
  const items = await tx.select({ productId: orderItems.productId, quantity: orderItems.quantity })
    .from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const item of items) {
    if (item.productId) {
      await tx.update(products).set({
        reservedStock: sql`GREATEST(${products.reservedStock} - ${item.quantity}, 0)`,
        updatedAt: new Date(),
      }).where(eq(products.id, item.productId));
    }
  }
}

async function incrementCouponUsage(tx: PaymentTransaction, couponCode: string | null) {
  if (!couponCode) return;
  await tx.update(coupons).set({
    usedCount: sql`${coupons.usedCount} + 1`,
    updatedAt: new Date(),
  }).where(and(eq(coupons.code, couponCode), sql`${coupons.maxUses} IS NULL OR ${coupons.usedCount} < ${coupons.maxUses}`));
}

export async function markOrderPaid(input: {
  providerOrderId: string;
  providerPaymentId: string;
  signature?: string | null;
  method?: string | null;
  source: PaymentSource;
  expectedUserId?: string;
}) {
  return db.transaction(async (tx) => {
    const [record] = await tx.select({
      order: orders,
      payment: payments,
    }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
      .where(and(
        eq(payments.providerOrderId, input.providerOrderId),
        input.expectedUserId ? eq(orders.userId, input.expectedUserId) : sql`true`,
      )).limit(1);
    if (!record) return { state: "not_found" as const };
    if (record.order.paymentStatus === "paid" || record.payment.status === "paid") {
      return { state: "already_paid" as const, orderId: record.order.id, userId: record.order.userId };
    }
    if (record.order.status === "cancelled" || record.payment.status === "expired") {
      return { state: "not_payable" as const };
    }
    await finalizeReservedStock(tx, record.order.id);
    await incrementCouponUsage(tx, record.order.couponCode);
    await tx.update(orders).set({
      paymentStatus: "paid",
      status: "confirmed",
      reservedUntil: null,
      updatedAt: new Date(),
    }).where(and(eq(orders.id, record.order.id), sql`${orders.paymentStatus} <> 'paid'`));
    await tx.update(payments).set({
      providerPaymentId: input.providerPaymentId,
      providerPaymentMethod: input.method ?? null,
      signature: input.signature ?? null,
      status: "paid",
      updatedAt: new Date(),
    }).where(and(eq(payments.id, record.payment.id), sql`${payments.status} <> 'paid'`));
    await tx.delete(cartItems).where(eq(cartItems.userId, record.order.userId));
    return { state: "paid" as const, orderId: record.order.id, userId: record.order.userId };
  });
}

export function paymentAmountInPaise(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Invalid payment amount.");
  return amount;
}

export function paymentExpiryDate() {
  return new Date(Date.now() + getEnv().PAYMENT_PENDING_EXPIRY_MINUTES * 60_000);
}
