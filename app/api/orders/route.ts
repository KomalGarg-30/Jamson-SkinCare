import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, orderItems, products } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

export async function GET() {
  try {
    const user = await requireUser();
    const list = await db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt));
    return NextResponse.json({ orders: list });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = z.object({ orderId: z.uuid() }).parse(await request.json());
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders)
        .where(and(eq(orders.id, body.orderId), eq(orders.userId, user.id))).limit(1);
      if (!order) return "missing";
      if (!["pending", "confirmed"].includes(order.status)) return "not-cancellable";
      const [cancelled] = await tx.update(orders).set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), inArray(orders.status, ["pending", "confirmed"]))).returning({ id: orders.id });
      if (!cancelled) return "not-cancellable";
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const item of items) {
        if (item.productId) await tx.update(products)
          .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
          .where(eq(products.id, item.productId));
      }
      return "cancelled";
    });
    if (result === "missing") return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (result === "not-cancellable") return NextResponse.json({ error: "This order can no longer be cancelled." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
