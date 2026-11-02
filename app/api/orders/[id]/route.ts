import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, orderItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.userId, user.id))).limit(1);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));
    return NextResponse.json({ order, items });
  } catch (error) {
    return errorResponse(error);
  }
}
