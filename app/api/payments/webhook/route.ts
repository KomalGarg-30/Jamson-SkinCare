import { after, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { orders, paymentDiscrepancies, payments, refunds, users, webhookEvents } from "@/db/schema";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { markOrderPaid, razorpayClient, verifyWebhookSignature } from "@/lib/payment-service";
import { sendEmail } from "@/lib/email";
import { orderEmail } from "@/lib/email-templates";

type RecordValue = Record<string, unknown>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entityFor(event: RecordValue, key: "payment" | "refund" | "order") {
  const payload = isRecord(event.payload) ? event.payload : null;
  const container = payload && isRecord(payload[key]) ? payload[key] : null;
  return container && isRecord(container.entity) ? container.entity : null;
}

function safePayload(entity: RecordValue | null) {
  if (!entity) return null;
  return {
    id: typeof entity.id === "string" ? entity.id : null,
    order_id: typeof entity.order_id === "string" ? entity.order_id : null,
    payment_id: typeof entity.payment_id === "string" ? entity.payment_id : null,
    amount: typeof entity.amount === "number" ? entity.amount : null,
    currency: typeof entity.currency === "string" ? entity.currency : null,
    status: typeof entity.status === "string" ? entity.status : null,
    error_code: typeof entity.error_code === "string" ? entity.error_code : null,
    error_description: typeof entity.error_description === "string" ? entity.error_description : null,
  };
}

function scheduleEmail(userId: string, text: string) {
  after(async () => {
    try {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (user) await sendEmail({ to: user.email, ...orderEmail("confirmation", text) });
    } catch (error) {
      console.error("Payment email notification failed.", { name: error instanceof Error ? error.name : "UnknownError" });
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-razorpay-signature");
    const eventId = request.headers.get("x-razorpay-event-id");
    if (!signature || !eventId || eventId.length > 160 || !verifyWebhookSignature(body, signature)) {
      console.error("Razorpay webhook signature verification failed.");
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
    }
    const parsed: unknown = JSON.parse(body);
    if (!isRecord(parsed) || typeof parsed.event !== "string") {
      return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
    }
    const eventType = parsed.event;
    const entity = entityFor(parsed, eventType.startsWith("refund.") ? "refund" : eventType === "order.paid" ? "order" : "payment");
    const [accepted] = await db.insert(webhookEvents).values({
      eventId, eventType, payload: safePayload(entity),
    }).onConflictDoNothing().returning({ eventId: webhookEvents.eventId });
    if (!accepted) return NextResponse.json({ received: true, duplicate: true });

    const env = getEnv();
    if (eventType === "payment.captured" || eventType === "order.paid") {
      const providerOrderId = eventType === "order.paid"
        ? (typeof entity?.id === "string" ? entity.id : null)
        : (typeof entity?.order_id === "string" ? entity.order_id : null);
      let providerPaymentId = typeof entity?.id === "string" && eventType !== "order.paid" ? entity.id : null;
      let amount = typeof entity?.amount === "number" ? entity.amount : null;
      let currency = typeof entity?.currency === "string" ? entity.currency : null;
      if (eventType === "order.paid" && providerOrderId) {
        const gatewayPayments = await razorpayClient().orders.fetchPayments(providerOrderId) as { items?: Array<{ id?: string; amount?: number; currency?: string; status?: string; method?: string }> };
        const captured = gatewayPayments.items?.find((payment) => payment.status === "captured") || gatewayPayments.items?.[0];
        providerPaymentId = captured?.id || null;
        amount = captured?.amount ?? null;
        currency = captured?.currency ?? null;
      }
      if (!providerOrderId || !providerPaymentId || amount === null || currency !== env.CURRENCY) {
        return NextResponse.json({ error: "Invalid payment webhook payload." }, { status: 400 });
      }
      const [record] = await db.select({ paymentId: payments.id, orderId: orders.id, userId: orders.userId, amount: payments.amount })
        .from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
        .where(eq(payments.providerOrderId, providerOrderId)).limit(1);
      if (!record || record.amount !== amount) {
        if (record) {
          await db.insert(paymentDiscrepancies).values({
            orderId: record.orderId, paymentId: record.paymentId, kind: "amount_mismatch",
            details: { providerAmount: amount, expectedAmount: record.amount, providerOrderId },
          });
          await db.update(orders).set({ status: "payment_review", updatedAt: new Date() }).where(eq(orders.id, record.orderId));
        }
        return NextResponse.json({ received: true });
      }
      const result = await markOrderPaid({ providerOrderId, providerPaymentId, source: "webhook", method: typeof entity?.method === "string" ? entity.method : null });
      if (result.state === "paid") scheduleEmail(record.userId, `Your order ${record.orderId} has been confirmed and payment was received.`);
    } else if (eventType === "payment.authorized") {
      const providerOrderId = typeof entity?.order_id === "string" ? entity.order_id : null;
      if (providerOrderId) await db.update(payments).set({ status: "authorized", updatedAt: new Date() }).where(eq(payments.providerOrderId, providerOrderId));
    } else if (eventType === "payment.failed") {
      const providerOrderId = typeof entity?.order_id === "string" ? entity.order_id : null;
      if (providerOrderId) {
        await db.update(payments).set({
          status: "failed",
          failureReason: typeof entity?.error_description === "string" ? entity.error_description : "Payment failed",
          updatedAt: new Date(),
        }).where(eq(payments.providerOrderId, providerOrderId));
      }
    } else if (eventType.startsWith("refund.")) {
      const refundId = typeof entity?.id === "string" ? entity.id : null;
      if (refundId) {
        const status = eventType === "refund.processed" ? "processed" : eventType === "refund.failed" ? "failed" : "pending";
        const [refund] = await db.update(refunds).set({ status, updatedAt: new Date() })
          .where(eq(refunds.razorpayRefundId, refundId)).returning({ paymentId: refunds.paymentId });
        if (refund && status === "processed") {
          await db.update(payments).set({ status: "refunded", updatedAt: new Date() }).where(eq(payments.id, refund.paymentId));
        }
      }
    }
    await db.update(webhookEvents).set({ status: "processed", processedAt: new Date() }).where(eq(webhookEvents.eventId, eventId));
    return NextResponse.json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
