import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cartItems, coupons, products, settings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = z.object({ code: z.string().trim().min(1).max(50) }).parse(await request.json());
    const items = await db.select({
      quantity: cartItems.quantity, price: products.price, discountPrice: products.discountPrice,
    }).from(cartItems).innerJoin(products, eq(cartItems.productId, products.id))
      .where(and(eq(cartItems.userId, user.id), eq(products.isActive, true)));
    if (!items.length) return NextResponse.json({ error: "Your bag is empty." }, { status: 400 });
    const subtotal = items.reduce((sum, item) => sum + (item.discountPrice ?? item.price) * item.quantity, 0);
    const configRows = await db.select().from(settings);
    const config = new Map(configRows.map((row) => [row.key, row.value]));
    const shipping = subtotal >= Number(config.get("free_shipping_threshold") ?? 200000) ? 0 : Number(config.get("shipping_charge") ?? 9900);
    const tax = Math.round(subtotal * Number(config.get("tax_percent") ?? 0) / 100);
    const [coupon] = await db.select().from(coupons).where(eq(coupons.code, data.code.toUpperCase())).limit(1);
    if (!coupon || !coupon.isActive || (coupon.expiresAt && coupon.expiresAt < new Date()) ||
        (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) || subtotal < coupon.minOrder) {
      return NextResponse.json({ error: "That coupon is invalid, expired, or not applicable to this order." }, { status: 400 });
    }
    const discount = coupon.type === "percentage" ? Math.round(subtotal * coupon.value / 100) : Math.min(subtotal, coupon.value);
    return NextResponse.json({ subtotal, shipping, tax, discount, total: Math.max(0, subtotal + shipping + tax - discount) });
  } catch (error) {
    return errorResponse(error);
  }
}
