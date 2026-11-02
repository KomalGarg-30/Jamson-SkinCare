import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orderItems, orders, reviews } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  productId: z.uuid(), orderId: z.uuid(), rating: z.number().int().min(1).max(5),
  title: z.string().max(160).optional(), body: z.string().trim().min(10).max(3000),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const productId = new URL(request.url).searchParams.get("productId");
    const parsedProductId = z.uuid().safeParse(productId);
    if (!parsedProductId.success) return NextResponse.json({ error: "Product id is required." }, { status: 400 });
    const eligibleOrders = await db.select({ id: orders.id, createdAt: orders.createdAt })
      .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.userId, user.id), eq(orders.paymentStatus, "paid"), eq(orderItems.productId, parsedProductId.data)));
    return NextResponse.json({ orders: eligibleOrders });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = schema.parse(await request.json());
    const [purchase] = await db.select({ id: orderItems.id }).from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.id, data.orderId), eq(orders.userId, user.id),
        eq(orderItems.productId, data.productId), eq(orders.paymentStatus, "paid")))
      .limit(1);
    if (!purchase) return NextResponse.json({ error: "You can review products only after purchasing them." }, { status: 403 });
    const [review] = await db.insert(reviews).values({ ...data, userId: user.id }).returning();
    return NextResponse.json({ review, message: "Thanks! Your review will appear after approval." }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
