import { and, desc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { payments, orders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const query = new URL(request.url).searchParams;
    const search = query.get("q")?.trim();
    const status = query.get("status");
    const page = Math.max(1, Number(query.get("page") || 1));
    const pageSize = 25;
    const rows = await db.select({
      id: payments.id, orderId: payments.orderId, provider: payments.provider,
      providerOrderId: payments.providerOrderId, providerPaymentId: payments.providerPaymentId,
      amount: payments.amount, status: payments.status, method: payments.providerPaymentMethod,
      failureReason: payments.failureReason, refundedAmount: payments.refundedAmount,
      createdAt: payments.createdAt, orderNumber: orders.id, userName: users.name, userEmail: users.email,
    }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id)).innerJoin(users, eq(payments.userId, users.id))
      .where(and(
        status ? eq(payments.status, status as typeof payments.$inferSelect.status) : undefined,
        search ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`), ilike(orders.id, `%${search}%`)) : undefined,
      )).orderBy(desc(payments.createdAt)).limit(pageSize).offset((page - 1) * pageSize);
    if (query.get("format") === "csv") {
      const csv = ["paymentId,orderId,user,amount,status,method,createdAt", ...rows.map((row) =>
        [row.id, row.orderId, row.userEmail, row.amount, row.status, row.method || "", row.createdAt.toISOString()].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n");
      return new Response(csv, { headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=payments.csv" } });
    }
    return NextResponse.json({ payments: rows, page, pageSize });
  } catch (error) {
    return errorResponse(error);
  }
}
