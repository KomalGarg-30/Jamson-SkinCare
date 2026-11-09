import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, payments, refunds } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.select({
      id: payments.id, orderId: payments.orderId, amount: payments.amount, status: payments.status,
      method: payments.providerPaymentMethod, providerPaymentId: payments.providerPaymentId,
      refundedAmount: payments.refundedAmount, createdAt: payments.createdAt,
      refundStatus: refunds.status,
    }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
      .leftJoin(refunds, eq(refunds.paymentId, payments.id))
      .where(eq(orders.userId, user.id)).orderBy(desc(payments.createdAt));
    return NextResponse.json({ payments: rows });
  } catch (error) {
    return errorResponse(error);
  }
}
