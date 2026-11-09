import Razorpay from "razorpay";
import { and, eq, isNull } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { auditLogs, orders, payments, refunds, returns, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { requireEnv } from "@/lib/env";
import { db } from "@/lib/db";
import { z } from "zod";
import { sendEmail } from "@/lib/email";
import { orderEmail } from "@/lib/email-templates";

function scheduleRefundEmail(userId: string, returnId: string) {
  after(async () => {
    try {
      const [customer] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (customer) {
        const content = orderEmail("refund_processed", `The refund for return ${returnId} has been processed.`);
        await sendEmail({ to: customer.email, ...content });
      }
    } catch (error) {
      console.error("Refund confirmation email failed.", { name: error instanceof Error ? error.name : "UnknownError" });
    }
  });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const parsedId = z.uuid().safeParse(id);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid return ID." }, { status: 400 });
    const result = await db.transaction(async (tx) => {
      const [record] = await tx.select({
        id: returns.id, userId: returns.userId, orderId: returns.orderId, status: returns.status,
        refundAmount: returns.refundAmount, refundedAt: returns.refundedAt, refundRequestedAt: returns.refundRequestedAt,
      }).from(returns).where(eq(returns.id, parsedId.data)).for("update").limit(1);
      if (!record) return { error: "Return request not found.", status: 404 as const };
      if (record.status === "refunded" || record.refundedAt) return { error: "This return has already been refunded.", status: 409 as const };
      if (record.status !== "received") return { error: "Items must be marked received before a refund can be issued.", status: 409 as const };
      if (record.refundAmount <= 0) return { error: "This return has no refundable item amount.", status: 409 as const };
      if (record.refundRequestedAt) return { error: "A refund request is already in progress.", status: 409 as const };
      const [order] = await tx.select({ paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus })
        .from(orders).where(eq(orders.id, record.orderId)).limit(1);
      if (!order) return { error: "The original order could not be found.", status: 404 as const };
      if (order.paymentMethod === "cod") {
        const now = new Date();
        const [updated] = await tx.update(returns).set({
          status: "refunded", refundedAt: now, updatedAt: now,
        }).where(and(eq(returns.id, record.id), isNull(returns.refundedAt))).returning();
        if (!updated) return { error: "This return has already been refunded.", status: 409 as const };
        await tx.insert(auditLogs).values({
          actorUserId: admin.id, targetUserId: record.userId, action: "return_refunded",
          oldValue: { status: "received" }, newValue: { status: "refunded", amount: record.refundAmount, method: "manual_cod" },
        });
        return { record: updated, manual: true as const };
      }
      if (order.paymentMethod !== "razorpay" || order.paymentStatus !== "paid") {
        return { error: "The original online payment is not eligible for an automated refund.", status: 409 as const };
      }
      const [payment] = await tx.select({ id: payments.id, providerPaymentId: payments.providerPaymentId })
        .from(payments).where(eq(payments.orderId, record.orderId)).limit(1);
      if (!payment?.providerPaymentId) return { error: "The original Razorpay payment ID is unavailable.", status: 409 as const };
      const now = new Date();
      await tx.update(returns).set({ refundRequestedAt: now, updatedAt: now }).where(eq(returns.id, record.id));
      return { record, paymentId: payment.providerPaymentId, paymentDbId: payment.id, manual: false as const };
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.manual) {
      scheduleRefundEmail(result.record.userId, result.record.id);
      return NextResponse.json({ return: result.record, message: "COD refund marked as issued. Complete the refund manually." });
    }

    let refundId: string;
    try {
      const razorpay = new Razorpay({
        key_id: requireEnv("RAZORPAY_KEY_ID"), key_secret: requireEnv("RAZORPAY_KEY_SECRET"),
      });
      const refund = await razorpay.payments.refund(result.paymentId, {
        amount: result.record.refundAmount, receipt: result.record.id,
        notes: { returnId: result.record.id, orderId: result.record.orderId },
      });
      refundId = refund.id;
    } catch (error) {
      await db.update(returns).set({ refundRequestedAt: null, updatedAt: new Date() }).where(eq(returns.id, parsedId.data));
      return errorResponse(error);
    }

    const updated = await db.transaction(async (tx) => {
      const [record] = await tx.update(returns).set({
        status: "refunded", providerRefundId: refundId, refundRequestedAt: null,
        refundedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(returns.id, parsedId.data), eq(returns.status, "received"), isNull(returns.refundedAt)))
        .returning();
      if (record) await tx.insert(auditLogs).values({
        actorUserId: admin.id, targetUserId: record.userId, action: "return_refunded",
        oldValue: { status: "received" },
        newValue: { status: "refunded", amount: record.refundAmount, providerRefundId: refundId },
      });
      if (record) await tx.insert(refunds).values({
        paymentId: result.paymentDbId, returnId: record.id, razorpayRefundId: refundId,
        amount: record.refundAmount, status: "pending", reason: record.reason, createdBy: admin.id,
      }).onConflictDoNothing();
      return record;
    });
    if (!updated) return NextResponse.json({ error: `The refund was issued but the return record could not be finalized. Contact support with refund ${refundId}.` }, { status: 409 });
    scheduleRefundEmail(updated.userId, updated.id);
    return NextResponse.json({ return: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
