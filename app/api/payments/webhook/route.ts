import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { orders, payments, returns, users, webhookEvents } from "@/db/schema";
import { requireEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { orderEmail } from "@/lib/email-templates";

type JsonRecord = Record<string, unknown>;

function scheduleOrderEmail(userId: string, kind: "confirmation" | "refund_processed", details: string) {
  after(async () => {
    try {
      const [customer] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (customer) {
        const content = orderEmail(kind, details);
        await sendEmail({ to: customer.email, ...content });
      }
    } catch (error) {
      console.error("Payment email notification failed.", { name: error instanceof Error ? error.name : "UnknownError" });
    }
  });
}

export const runtime = "nodejs";
export const maxDuration = 30;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    if (!signature) return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
    const expected = createHmac("sha256", requireEnv("RAZORPAY_WEBHOOK_SECRET")).update(body).digest();
    const received = Buffer.from(signature, "hex");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
    }

    const event: unknown = JSON.parse(body);
    if (!isRecord(event) || typeof event.event !== "string") {
      return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    }
    const eventId = request.headers.get("x-razorpay-event-id");
    if (!eventId || eventId.length > 160) {
      return NextResponse.json({ error: "Missing or invalid webhook event ID." }, { status: 400 });
    }
    if (event.event === "payment.captured") {
      const payload = isRecord(event.payload) ? event.payload : null;
      const paymentPayload = payload && isRecord(payload.payment) ? payload.payment : null;
      const entity = paymentPayload && isRecord(paymentPayload.entity) ? paymentPayload.entity : null;
      const providerOrderId = entity?.order_id;
      const providerPaymentId = entity?.id;
      const amount = entity?.amount;
      const currency = entity?.currency;
      if (typeof providerOrderId !== "string" || typeof providerPaymentId !== "string" ||
          typeof amount !== "number" || typeof currency !== "string") {
        return NextResponse.json({ error: "Invalid captured-payment payload." }, { status: 400 });
      }
      if (currency !== (process.env.CURRENCY || "INR")) {
        return NextResponse.json({ error: "Payment currency does not match the store." }, { status: 400 });
      }
      const processed = await db.transaction(async (tx) => {
        const [acceptedEvent] = await tx.insert(webhookEvents).values({
          eventId, eventType: event.event as string,
        }).onConflictDoNothing().returning({ eventId: webhookEvents.eventId });
        if (!acceptedEvent) return { accepted: false, userId: undefined, orderId: undefined };
        const [record] = await tx.select().from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
          .where(eq(payments.providerOrderId, providerOrderId)).limit(1);
        if (!record || record.payments.amount !== amount || record.orders.status === "cancelled") {
          return { accepted: true, userId: undefined, orderId: undefined };
        }
        const [updatedOrder] = await tx.update(orders).set({
          paymentStatus: "paid", status: "confirmed", updatedAt: new Date(),
        }).where(and(
          eq(orders.id, record.orders.id), eq(orders.paymentStatus, "pending"), ne(orders.status, "cancelled"),
        )).returning({ id: orders.id });
        if (!updatedOrder) return { accepted: true, userId: undefined, orderId: undefined };
        await tx.update(payments).set({
          providerPaymentId, status: "paid", updatedAt: new Date(),
        }).where(and(eq(payments.id, record.payments.id), eq(payments.status, "pending")));
        return { accepted: true, userId: record.orders.userId, orderId: record.orders.id };
      });
      if (!processed.accepted) return NextResponse.json({ received: true, duplicate: true });
      if (processed.userId && processed.orderId) {
        scheduleOrderEmail(processed.userId, "confirmation", `Your order ${processed.orderId} has been confirmed and payment was received.`);
      }
    } else if (event.event === "payment.failed") {
      const payload = isRecord(event.payload) ? event.payload : null;
      const paymentPayload = payload && isRecord(payload.payment) ? payload.payment : null;
      const entity = paymentPayload && isRecord(paymentPayload.entity) ? paymentPayload.entity : null;
      const providerOrderId = entity?.order_id;
      if (typeof providerOrderId !== "string") {
        return NextResponse.json({ error: "Invalid failed-payment payload." }, { status: 400 });
      }
      const processed = await db.transaction(async (tx) => {
        const [acceptedEvent] = await tx.insert(webhookEvents).values({
          eventId, eventType: event.event as string,
        }).onConflictDoNothing().returning({ eventId: webhookEvents.eventId });
        if (!acceptedEvent) return false;
        const [record] = await tx.select({ paymentId: payments.id, orderId: orders.id })
          .from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
          .where(eq(payments.providerOrderId, providerOrderId)).limit(1);
        if (record) {
          await tx.update(payments).set({ status: "failed", updatedAt: new Date() })
            .where(and(eq(payments.id, record.paymentId), eq(payments.status, "pending")));
          await tx.update(orders).set({ paymentStatus: "failed", updatedAt: new Date() })
            .where(and(eq(orders.id, record.orderId), eq(orders.paymentStatus, "pending"), ne(orders.status, "cancelled")));
        }
        return true;
      });
      if (!processed) return NextResponse.json({ received: true, duplicate: true });
    } else if (event.event === "refund.processed") {
      const payload = isRecord(event.payload) ? event.payload : null;
      const refundPayload = payload && isRecord(payload.refund) ? payload.refund : null;
      const entity = refundPayload && isRecord(refundPayload.entity) ? refundPayload.entity : null;
      const refundId = entity?.id;
      const providerPaymentId = entity?.payment_id;
      const amount = entity?.amount;
      if (typeof refundId !== "string" || typeof providerPaymentId !== "string" || typeof amount !== "number") {
        return NextResponse.json({ error: "Invalid processed-refund payload." }, { status: 400 });
      }
      const processed = await db.transaction(async (tx) => {
        const [acceptedEvent] = await tx.insert(webhookEvents).values({
          eventId, eventType: event.event as string,
        }).onConflictDoNothing().returning({ eventId: webhookEvents.eventId });
        if (!acceptedEvent) return { accepted: false, returnRecord: undefined };
        const now = new Date();
        const [returnRecord] = await tx.update(returns).set({ status: "refunded", refundedAt: now, updatedAt: now })
          .where(and(eq(returns.providerRefundId, refundId), eq(returns.status, "received")))
          .returning({ id: returns.id, userId: returns.userId });
        const [payment] = await tx.select().from(payments).where(eq(payments.providerPaymentId, providerPaymentId)).limit(1);
        if (payment && payment.amount === amount) {
          await tx.update(payments).set({ status: "refunded", updatedAt: now }).where(eq(payments.id, payment.id));
          await tx.update(orders).set({ paymentStatus: "refunded", updatedAt: now })
            .where(eq(orders.id, payment.orderId));
        }
        return { accepted: true, returnRecord };
      });
      if (!processed.accepted) return NextResponse.json({ received: true, duplicate: true });
      if (processed.returnRecord) {
        scheduleOrderEmail(processed.returnRecord.userId, "refund_processed", `The refund for return ${processed.returnRecord.id} has been processed.`);
      }
    } else {
      const [acceptedEvent] = await db.insert(webhookEvents).values({
        eventId, eventType: event.event,
      }).onConflictDoNothing().returning({ eventId: webhookEvents.eventId });
      if (!acceptedEvent) return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
