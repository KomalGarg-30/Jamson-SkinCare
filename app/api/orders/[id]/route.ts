import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, orderItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { reconcilePendingOrder } from "@/lib/payment-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, user.id))).limit(1);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.status === "pending_payment") {
      await reconcilePendingOrder(order.id, user.id);
      const [refreshed] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, user.id))).limit(1);
      if (refreshed) Object.assign(order, refreshed);
    }
    const items = await db.select({
      id: orderItems.id, productName: orderItems.productName, sku: orderItems.sku,
      quantity: orderItems.quantity, unitPrice: orderItems.unitPrice,
      image: sql<string | null>`(SELECT url FROM product_images WHERE product_id = ${orderItems.productId} ORDER BY position ASC LIMIT 1)`,
    }).from(orderItems).where(eq(orderItems.orderId, id));
    return NextResponse.json({ order, items });
  } catch (error) {
    return errorResponse(error);
  }
}
