import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, orderItems, payments, products, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const status = new URL(request.url).searchParams.get("status");
    const parsedStatus = z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]).safeParse(status);
    const validStatus = parsedStatus.success ? parsedStatus.data : null;
    const list = await db.select({
      id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus, paymentMethod: orders.paymentMethod,
      total: orders.total, createdAt: orders.createdAt, customerName: users.name, customerEmail: users.email,
    }).from(orders).innerJoin(users, eq(orders.userId, users.id))
      .where(validStatus ? eq(orders.status, validStatus) : undefined).orderBy(desc(orders.createdAt)).limit(100);
    return NextResponse.json({ orders: list });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const data = z.object({
      id: z.uuid(), status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]).optional(),
      paymentStatus: z.enum(["pending", "paid", "failed", "refunded"]).optional(),
    }).refine((value) => value.status || value.paymentStatus).parse(await request.json());
    const { id, ...updates } = data;
    const order = await db.transaction(async (tx) => {
      const [previous] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!previous) return undefined;
      if (updates.status === "cancelled" && previous.status !== "cancelled") {
        const [cancelled] = await tx.update(orders).set({ ...updates, updatedAt: new Date() })
          .where(and(eq(orders.id, id), inArray(orders.status, ["pending", "confirmed"]))).returning();
        if (!cancelled) throw new Error("Only pending or confirmed orders can be cancelled.");
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
        for (const item of items) {
          if (item.productId) await tx.update(products)
            .set({ stock: sql`${products.stock} + ${item.quantity}`, updatedAt: new Date() })
            .where(eq(products.id, item.productId));
        }
        if (updates.paymentStatus) {
          await tx.update(payments).set({ status: updates.paymentStatus, updatedAt: new Date() }).where(eq(payments.orderId, id));
        }
        return cancelled;
      }
      const [updated] = await tx.update(orders).set({
        ...updates,
        ...(updates.status === "delivered" && !previous.deliveredAt ? { deliveredAt: new Date() } : {}),
        updatedAt: new Date(),
      })
        .where(eq(orders.id, id)).returning();
      if (updates.paymentStatus) {
        await tx.update(payments).set({ status: updates.paymentStatus, updatedAt: new Date() }).where(eq(payments.orderId, id));
      }
      return updated;
    });
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    return errorResponse(error);
  }
}
