import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { cartItems, coupons, orderItems, orders, payments, products, settings, addresses } from "@/db/schema";
import { requireEnv } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  addressId: z.uuid(),
  paymentMethod: z.enum(["razorpay", "cod"]),
  couponCode: z.string().trim().max(50).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = checkoutSchema.parse(await request.json());
    const [address] = await db.select().from(addresses)
      .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, user.id))).limit(1);
    if (!address) return NextResponse.json({ error: "Select one of your saved delivery addresses." }, { status: 400 });
    const cart = await db.select({
      productId: products.id, name: products.name, sku: products.sku, price: products.price,
      discountPrice: products.discountPrice, stock: products.stock, quantity: cartItems.quantity,
    }).from(cartItems).innerJoin(products, eq(cartItems.productId, products.id))
      .where(and(eq(cartItems.userId, user.id), eq(products.isActive, true)));
    if (cart.length === 0) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
    const subtotal = cart.reduce((sum, item) => sum + (item.discountPrice ?? item.price) * item.quantity, 0);
    const configRows = await db.select().from(settings);
    const config = new Map(configRows.map((row) => [row.key, row.value]));
    const shippingThreshold = Number(config.get("free_shipping_threshold") ?? 200000);
    const shippingCharge = Number(config.get("shipping_charge") ?? 9900);
    const taxPercent = Number(config.get("tax_percent") ?? 0);
    const shipping = subtotal >= shippingThreshold ? 0 : shippingCharge;
    const tax = Math.round(subtotal * taxPercent / 100);
    let discount = 0;
    let coupon: typeof coupons.$inferSelect | undefined;
    if (input.couponCode) {
      const [found] = await db.select().from(coupons).where(eq(coupons.code, input.couponCode.toUpperCase())).limit(1);
      if (!found || !found.isActive || (found.expiresAt && found.expiresAt < new Date()) ||
          (found.maxUses !== null && found.usedCount >= found.maxUses) || subtotal < found.minOrder) {
        return NextResponse.json({ error: "That coupon is invalid, expired, or not applicable to this order." }, { status: 400 });
      }
      coupon = found;
      discount = found.type === "percentage" ? Math.round(subtotal * found.value / 100) : Math.min(subtotal, found.value);
    }
    const total = Math.max(0, subtotal + shipping + tax - discount);
    const orderId = randomUUID();
    let providerOrderId: string | null = null;
    const publicKey = input.paymentMethod === "razorpay" ? requireEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID") : null;
    if (input.paymentMethod === "razorpay") {
      const razorpay = new Razorpay({ key_id: requireEnv("RAZORPAY_KEY_ID"), key_secret: requireEnv("RAZORPAY_KEY_SECRET") });
      const paymentOrder = await razorpay.orders.create({
        amount: total, currency: process.env.CURRENCY || "INR", receipt: orderId,
        notes: { customerId: user.id },
      });
      providerOrderId = paymentOrder.id;
    }
    await db.transaction(async (tx) => {
      for (const item of cart) {
        const [updated] = await tx.update(products)
          .set({ stock: sql`${products.stock} - ${item.quantity}`, updatedAt: new Date() })
          .where(and(eq(products.id, item.productId), sql`${products.stock} >= ${item.quantity}`))
          .returning({ id: products.id });
        if (!updated) throw new Error(`Not enough stock remains for ${item.name}. Please update your cart.`);
      }
      if (coupon) {
        const couponUpdate = await tx.update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1`, updatedAt: new Date() })
          .where(and(eq(coupons.id, coupon.id), coupon.maxUses === null ? sql`true` : sql`${coupons.usedCount} < ${coupon.maxUses}`))
          .returning({ id: coupons.id });
        if (couponUpdate.length === 0) throw new Error("That coupon has reached its usage limit.");
      }
      await tx.insert(orders).values({
        id: orderId, userId: user.id, addressId: address.id,
        status: input.paymentMethod === "cod" ? "confirmed" : "pending",
        paymentStatus: "pending", paymentMethod: input.paymentMethod,
        subtotal, shipping, tax, discount, total, couponCode: coupon?.code ?? null,
        shippingAddress: {
          name: address.name, phone: address.phone, line1: address.line1, line2: address.line2,
          city: address.city, state: address.state, pincode: address.pincode, country: address.country,
        },
      });
      await tx.insert(orderItems).values(cart.map((item) => ({
        orderId, productId: item.productId, productName: item.name, sku: item.sku,
        quantity: item.quantity, unitPrice: item.discountPrice ?? item.price,
      })));
      await tx.insert(payments).values({
        orderId, provider: input.paymentMethod, providerOrderId, amount: total, status: "pending",
      });
      await tx.delete(cartItems).where(eq(cartItems.userId, user.id));
    });
    return NextResponse.json({
      orderId, total, paymentMethod: input.paymentMethod,
      razorpay: providerOrderId && publicKey ? { orderId: providerOrderId, keyId: publicKey, currency: process.env.CURRENCY || "INR" } : null,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
