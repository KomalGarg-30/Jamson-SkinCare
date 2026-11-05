import { desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLogs, orderItems, orders, products, returnItems, returns, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const status = new URL(request.url).searchParams.get("status");
    const parsed = z.enum(["all", "requested", "approved", "rejected", "picked_up", "received", "refunded"]).safeParse(status ?? "all");
    if (!parsed.success) return NextResponse.json({ error: "Invalid return status filter." }, { status: 400 });
    const list = await db.select({
      id: returns.id, orderId: returns.orderId, userId: returns.userId, reason: returns.reason,
      comment: returns.comment, photos: returns.photos, status: returns.status, refundAmount: returns.refundAmount,
      providerRefundId: returns.providerRefundId, refundedAt: returns.refundedAt,
      adminNotes: returns.adminNotes, createdAt: returns.createdAt,
      userName: users.name, userEmail: users.email, paymentMethod: orders.paymentMethod,
    }).from(returns).innerJoin(users, eq(returns.userId, users.id))
      .innerJoin(orders, eq(returns.orderId, orders.id))
      .where(parsed.data === "all" ? undefined : eq(returns.status, parsed.data))
      .orderBy(desc(returns.createdAt)).limit(200);
    const itemList = list.length ? await db.select({
      returnId: returnItems.returnId, quantity: returnItems.quantity,
      productName: orderItems.productName, unitPrice: orderItems.unitPrice,
    }).from(returnItems).innerJoin(orderItems, eq(returnItems.orderItemId, orderItems.id))
      .where(inArray(returnItems.returnId, list.map((item) => item.id))) : [];
    return NextResponse.json({ returns: list, items: itemList });
  } catch (error) {
    return errorResponse(error);
  }
}

const updateSchema = z.object({
  status: z.enum(["approved", "rejected", "picked_up", "received"]).optional(),
  adminNotes: z.string().trim().max(2000).nullable().optional(),
  restoreStock: z.boolean().optional(),
}).refine((value) => value.status !== undefined || value.adminNotes !== undefined || value.restoreStock !== undefined);

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const { id } = z.object({ id: z.uuid() }).parse(body);
    const data = updateSchema.parse(body);
    const result = await db.transaction(async (tx) => {
      const [record] = await tx.select().from(returns).where(eq(returns.id, id)).for("update").limit(1);
      if (!record) return { error: "Return request not found.", status: 404 as const };
      if (record.status === "refunded" || record.status === "rejected") {
        return { error: "This return request is already closed.", status: 409 as const };
      }
      if (data.status) {
        const transitions: Record<string, string[]> = {
          requested: ["approved", "rejected"], approved: ["picked_up"], picked_up: ["received"], received: ["received"],
        };
        if (!transitions[record.status]?.includes(data.status)) {
          return { error: `A return cannot move from ${record.status} to ${data.status}.`, status: 409 as const };
        }
      }
      const nextStatus = data.status ?? record.status;
      const restoreStock = data.restoreStock === true && nextStatus === "received" && !record.stockRestored;
      if (data.restoreStock && nextStatus !== "received") {
        return { error: "Stock can only be restored when the returned items are received.", status: 409 as const };
      }
      if (restoreStock) {
        const items = await tx.select({
          productId: orderItems.productId, quantity: returnItems.quantity,
        }).from(returnItems).innerJoin(orderItems, eq(returnItems.orderItemId, orderItems.id))
          .where(eq(returnItems.returnId, record.id));
        for (const item of items) {
          if (item.productId) await tx.update(products)
            .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
            .where(eq(products.id, item.productId));
        }
      }
      const [updated] = await tx.update(returns).set({
        ...(data.status ? { status: data.status } : {}),
        ...(data.adminNotes !== undefined ? { adminNotes: data.adminNotes } : {}),
        ...(restoreStock ? { stockRestored: true } : {}),
        updatedAt: new Date(),
      }).where(eq(returns.id, record.id)).returning();
      if (data.status && data.status !== record.status) {
        await tx.insert(auditLogs).values({
          actorUserId: admin.id, targetUserId: record.userId, action: "return_status_changed",
          oldValue: { returnId: record.id, status: record.status },
          newValue: { returnId: record.id, status: data.status, adminNotes: data.adminNotes ?? record.adminNotes },
        });
      }
      return { record: updated };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ return: result.record });
  } catch (error) {
    return errorResponse(error);
  }
}
