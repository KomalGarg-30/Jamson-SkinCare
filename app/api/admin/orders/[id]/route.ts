import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, orderItems, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const [order] = await db.select({
      id: orders.id, userId: orders.userId, status: orders.status, paymentStatus: orders.paymentStatus,
      paymentMethod: orders.paymentMethod, subtotal: orders.subtotal, shipping: orders.shipping, tax: orders.tax,
      discount: orders.discount, total: orders.total, shippingAddress: orders.shippingAddress,
      createdAt: orders.createdAt, customerName: users.name, customerEmail: users.email,
    }).from(orders).innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, id)).limit(1);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    return NextResponse.json({ order, items });
  } catch (error) {
    return errorResponse(error);
  }
}
