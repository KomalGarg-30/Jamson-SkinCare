import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orderItems, orders, returnItems, returns, settings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { getImageKitConfig } from "@/lib/imagekit";
import { z } from "zod";

const requestSchema = z.object({
  orderId: z.uuid(),
  reason: z.enum(["damaged", "wrong_item", "quality_issue", "changed_mind", "other"]),
  comment: z.string().trim().max(2000).optional(),
  photos: z.array(z.url().superRefine((value, context) => {
    const url = new URL(value);
    const config = getImageKitConfig();
    if (url.protocol !== "https:" || url.hostname !== new URL(config.urlEndpoint).hostname || !url.pathname.includes("/skincare-store/returns/")) {
      context.addIssue({ code: "custom", message: "Return photos must be uploaded to the return photo folder." });
    }
  })).max(4).default([]),
  items: z.array(z.object({ orderItemId: z.uuid(), quantity: z.number().int().min(1) }))
    .min(1).max(30).superRefine((items, context) => {
      if (new Set(items.map((item) => item.orderItemId)).size !== items.length) {
        context.addIssue({ code: "custom", message: "Choose each order item only once." });
      }
    }),
});

export async function GET() {
  try {
    const user = await requireUser();
    const list = await db.select({
      id: returns.id, orderId: returns.orderId, reason: returns.reason, comment: returns.comment,
      photos: returns.photos, status: returns.status, refundAmount: returns.refundAmount,
      providerRefundId: returns.providerRefundId, refundedAt: returns.refundedAt,
      adminNotes: returns.adminNotes, createdAt: returns.createdAt,
      updatedAt: returns.updatedAt,
    }).from(returns).where(eq(returns.userId, user.id)).orderBy(sql`${returns.createdAt} desc`);
    const items = list.length ? await db.select({
      returnId: returnItems.returnId, orderItemId: returnItems.orderItemId, quantity: returnItems.quantity,
      productName: orderItems.productName, unitPrice: orderItems.unitPrice,
    }).from(returnItems).innerJoin(orderItems, eq(returnItems.orderItemId, orderItems.id))
      .where(inArray(returnItems.returnId, list.map((item) => item.id))) : [];
    return NextResponse.json({ returns: list, items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = requestSchema.parse(await request.json());
    const [windowSetting] = await db.select({ value: settings.value }).from(settings)
      .where(eq(settings.key, "return_window_days")).limit(1);
    const windowDays = z.coerce.number().int().min(1).max(365)
      .parse(process.env.RETURN_WINDOW_DAYS?.trim() || windowSetting?.value || "7");
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, data.orderId), eq(orders.userId, user.id)))
        .for("update").limit(1);
      if (!order) return { error: "Order not found.", status: 404 as const };
      if (order.status !== "delivered") return { error: "Only delivered orders can be returned.", status: 409 as const };
      const deliveredAt = order.deliveredAt ?? order.updatedAt;
      if (Date.now() - deliveredAt.getTime() > windowDays * 24 * 60 * 60 * 1000) {
        return { error: `The ${windowDays}-day return window for this order has ended.`, status: 409 as const };
      }

      const ids = data.items.map((item) => item.orderItemId);
      const requestedItems = await tx.select().from(orderItems)
        .where(and(eq(orderItems.orderId, order.id), inArray(orderItems.id, ids)));
      if (requestedItems.length !== ids.length) return { error: "One or more selected items are not part of this order.", status: 400 as const };

      const reservations = await tx.select({
        orderItemId: returnItems.orderItemId,
        quantity: sql<number>`coalesce(sum(${returnItems.quantity}), 0)::int`,
      }).from(returnItems).innerJoin(returns, eq(returnItems.returnId, returns.id))
        .where(and(inArray(returnItems.orderItemId, ids), ne(returns.status, "rejected")))
        .groupBy(returnItems.orderItemId);
      const alreadyRequested = new Map(reservations.map((item) => [item.orderItemId, item.quantity]));
      for (const selection of data.items) {
        const orderItem = requestedItems.find((item) => item.id === selection.orderItemId);
        if (!orderItem || selection.quantity + (alreadyRequested.get(selection.orderItemId) ?? 0) > orderItem.quantity) {
          return { error: "The requested quantity exceeds the amount available to return.", status: 409 as const };
        }
      }
      const amount = data.items.reduce((sum, selection) => {
        const orderItem = requestedItems.find((item) => item.id === selection.orderItemId)!;
        return sum + orderItem.unitPrice * selection.quantity;
      }, 0);
      const [record] = await tx.insert(returns).values({
        userId: user.id, orderId: order.id, reason: data.reason, comment: data.comment || null,
        photos: data.photos, refundAmount: amount,
      }).returning();
      await tx.insert(returnItems).values(data.items.map((item) => ({
        returnId: record.id, orderItemId: item.orderItemId, quantity: item.quantity,
      })));
      return { record };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ return: result.record }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
