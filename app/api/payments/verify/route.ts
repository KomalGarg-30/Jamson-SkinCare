import { NextResponse } from "next/server";
import { z } from "zod";
import { orders, payments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { markOrderPaid, razorpayClient, verifyPaymentSignature } from "@/lib/payment-service";
import { rateLimitMany } from "@/lib/rate-limit";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const schema = z.object({
  orderId: z.uuid(),
  razorpay_order_id: z.string().min(1).max(120),
  razorpay_payment_id: z.string().min(1).max(120),
  razorpay_signature: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!await rateLimitMany([`payment-verify:user:${user.id}`, `payment-verify:ip:${ip}`], 8, 60_000)) {
      return NextResponse.json({ error: "Too many verification attempts. Please wait and try again." }, { status: 429 });
    }
    const input = schema.parse(await request.json());
    const [payment] = await db.select({
      amount: payments.amount, providerOrderId: payments.providerOrderId,
      orderUserId: orders.userId, orderStatus: orders.status, paymentStatus: orders.paymentStatus,
      currency: payments.provider,
    }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
      .where(and(eq(payments.orderId, input.orderId), eq(orders.userId, user.id), eq(payments.providerOrderId, input.razorpay_order_id))).limit(1);
    if (!payment) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
    if (payment.paymentStatus === "paid") return NextResponse.json({ success: true, alreadyPaid: true });
    if (!verifyPaymentSignature(input.razorpay_order_id, input.razorpay_payment_id, input.razorpay_signature)) {
      console.error("Payment signature verification failed.", { userId: user.id, orderId: input.orderId });
      return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
    }
    const gatewayPayment = await razorpayClient().payments.fetch(input.razorpay_payment_id) as {
      order_id?: string; amount?: number; currency?: string; status?: string; method?: string;
    };
    const env = getEnv();
    if (gatewayPayment.order_id !== input.razorpay_order_id || gatewayPayment.amount !== payment.amount || gatewayPayment.currency !== env.CURRENCY) {
      console.error("Payment amount or identity mismatch.", { userId: user.id, orderId: input.orderId });
      return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
    }
    if (gatewayPayment.status === "authorized") {
      await razorpayClient().payments.capture(input.razorpay_payment_id, payment.amount, env.CURRENCY);
    } else if (gatewayPayment.status !== "captured") {
      return NextResponse.json({ error: "Payment has not been captured. You can retry the payment." }, { status: 409 });
    }
    const result = await markOrderPaid({
      providerOrderId: input.razorpay_order_id,
      providerPaymentId: input.razorpay_payment_id,
      signature: input.razorpay_signature,
      method: gatewayPayment.method,
      source: "verify",
      expectedUserId: user.id,
    });
    if (result.state === "not_found" || result.state === "not_payable") {
      return NextResponse.json({ error: "Payment order is no longer payable." }, { status: 409 });
    }
    return NextResponse.json({ success: true, alreadyPaid: result.state === "already_paid" });
  } catch (error) {
    return errorResponse(error);
  }
}
