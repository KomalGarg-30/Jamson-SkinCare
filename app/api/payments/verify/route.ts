import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, payments } from "@/db/schema";
import { requireEnv } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { sendEmailAfterResponse } from "@/lib/email";
import { orderEmail } from "@/lib/email-templates";
import { z } from "zod";

const schema = z.object({
  orderId: z.uuid(), razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1), razorpay_signature: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = schema.parse(await request.json());
    const expected = createHmac("sha256", requireEnv("RAZORPAY_KEY_SECRET"))
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`).digest();
    const received = Buffer.from(data.razorpay_signature, "hex");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return NextResponse.json({ error: "Payment verification failed." }, { status: 400 });
    }
    const updated = await db.transaction(async (tx) => {
      const [payment] = await tx.select().from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
        .where(and(eq(payments.orderId, data.orderId), eq(orders.userId, user.id),
          eq(payments.providerOrderId, data.razorpay_order_id))).limit(1);
      if (!payment) return false;
      const [order] = await tx.update(orders).set({ paymentStatus: "paid", status: "confirmed", updatedAt: new Date() })
        .where(and(eq(orders.id, data.orderId), eq(orders.paymentStatus, "pending"), ne(orders.status, "cancelled")))
        .returning({ id: orders.id });
      if (!order) {
        const [alreadyConfirmed] = await tx.select({ id: orders.id }).from(orders).where(and(
          eq(orders.id, data.orderId), eq(orders.userId, user.id), eq(orders.paymentStatus, "paid"), eq(orders.status, "confirmed"),
        )).limit(1);
        return alreadyConfirmed ? "already" : false;
      }
      await tx.update(payments).set({
        providerPaymentId: data.razorpay_payment_id, signature: data.razorpay_signature,
        status: "paid", updatedAt: new Date(),
      }).where(and(eq(payments.id, payment.payments.id), eq(payments.status, "pending")));
      return "updated";
    });
    if (!updated) return NextResponse.json({ error: "Payment order not found or has already been cancelled." }, { status: 404 });
    if (updated === "updated") {
      const email = orderEmail("confirmation", `Your order ${data.orderId} has been confirmed and payment was received.`);
      sendEmailAfterResponse({ to: user.email, ...email });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
