import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, payments } from "@/db/schema";
import { requireEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";

type JsonRecord = Record<string, unknown>;

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
      await db.transaction(async (tx) => {
        const [record] = await tx.select().from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
          .where(eq(payments.providerOrderId, providerOrderId)).limit(1);
        if (!record || record.payments.amount !== amount || record.orders.status === "cancelled") return;
        const [updatedOrder] = await tx.update(orders).set({
          paymentStatus: "paid", status: "confirmed", updatedAt: new Date(),
        }).where(and(eq(orders.id, record.orders.id), ne(orders.status, "cancelled"))).returning({ id: orders.id });
        if (!updatedOrder) return;
        await tx.update(payments).set({
          providerPaymentId, status: "paid", updatedAt: new Date(),
        }).where(eq(payments.id, record.payments.id));
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
