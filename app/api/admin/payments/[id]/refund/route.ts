import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { paymentAuditLogs, payments, refunds } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { razorpayClient } from "@/lib/payment-service";
import { z } from "zod";

const schema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  speed: z.enum(["normal", "optimum"]).default("normal"),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const input = schema.parse(await request.json());
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, id)).for("update").limit(1);
      if (!payment || payment.provider !== "razorpay") return { error: "Payment not found.", status: 404 as const };
      if (!payment.providerPaymentId || !["paid", "refunded"].includes(payment.status)) return { error: "This payment is not refundable.", status: 409 as const };
      if (input.amount > payment.amount - payment.refundedAmount) return { error: "Refund amount exceeds the remaining paid amount.", status: 400 as const };
      const [refund] = await tx.insert(refunds).values({
        paymentId: payment.id, amount: input.amount, reason: input.reason, speed: input.speed, createdBy: admin.id,
      }).returning();
      await tx.insert(paymentAuditLogs).values({
        paymentId: payment.id, orderId: payment.orderId, actorUserId: admin.id,
        action: "refund_requested", amount: input.amount, reason: input.reason,
      });
      return { payment, refund };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    const gatewayRefund = await razorpayClient().payments.refund(result.payment.providerPaymentId!, {
      amount: input.amount,
      speed: input.speed,
      notes: { refundId: result.refund.id, orderId: result.payment.orderId },
    });
    const [updated] = await db.update(refunds).set({ razorpayRefundId: gatewayRefund.id, status: "pending", updatedAt: new Date() })
      .where(eq(refunds.id, result.refund.id)).returning();
    await db.update(payments).set({ refundedAmount: sql`${payments.refundedAmount} + ${input.amount}`, status: input.amount === result.payment.amount ? "refunded" : "paid", updatedAt: new Date() })
      .where(and(eq(payments.id, result.payment.id), eq(payments.status, result.payment.status)));
    return NextResponse.json({ refund: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
