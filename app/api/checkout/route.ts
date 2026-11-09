import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import Razorpay from "razorpay";
import { NextResponse } from "next/server";
import { z } from "zod";
import { addresses, cartItems, coupons, orderItems, orders, payments, productImages, products, settings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { getEnv, requireEnv } from "@/lib/env";
import { finalizeReservedStock, paymentExpiryDate, paymentAmountInPaise } from "@/lib/payment-service";
import { rateLimitMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkoutSchema = z.object({
  addressId: z.uuid(),
  paymentMethod: z.enum(["razorpay", "cod"]),
  couponCode: z.string().trim().max(50).optional(),
});

function requestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const ip = requestIp(request);
    if (!await rateLimitMany([`checkout:user:${user.id}`, `checkout:ip:${ip}`], 10, 60_000)) {
      return NextResponse.json({ error: "Too many checkout attempts. Please wait a minute and try again." }, { status: 429 });
    }
    const input = checkoutSchema.parse(await request.json());
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || randomUUID();
    if (idempotencyKey.length > 160) return NextResponse.json({ error: "Invalid idempotency key." }, { status: 400 });
    const env = getEnv();
    if (input.paymentMethod === "razorpay" && (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.NEXT_PUBLIC_RAZORPAY_KEY_ID)) {
      return NextResponse.json({ error: "Online payment is temporarily unavailable." }, { status: 503 });
    }
    if (input.paymentMethod === "cod" && !env.COD_ENABLED) {
      return NextResponse.json({ error: "Cash on delivery is not available." }, { status: 400 });
    }

    const existing = await db.select({
      orderId: orders.id, total: orders.total, paymentMethod: orders.paymentMethod, status: orders.status,
      providerOrderId: payments.providerOrderId, paymentStatus: orders.paymentStatus,
    }).from(orders).leftJoin(payments, eq(payments.orderId, orders.id))
      .where(and(eq(orders.userId, user.id), eq(orders.idempotencyKey, idempotencyKey))).limit(1);
    if (existing[0] && existing[0].paymentStatus !== "expired" && existing[0].status !== "cancelled") {
      return NextResponse.json({
        orderId: existing[0].orderId,
        amount: existing[0].total,
        currency: env.CURRENCY,
        razorpayOrderId: existing[0].providerOrderId,
        publicKeyId: input.paymentMethod === "razorpay" ? requireEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID") : null,
      });
    }

    const created = await db.transaction(async (tx) => {
      const [address] = await tx.select().from(addresses)
        .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, user.id))).limit(1);
      if (!address) throw new Error("Select one of your saved delivery addresses.");
      const configRows = await tx.select().from(settings);
      const config = new Map(configRows.map((row) => [row.key, row.value]));
      const shippingThreshold = Number(config.get("free_shipping_threshold") ?? 200000);
      const shippingCharge = Number(config.get("shipping_charge") ?? 9900);
      const taxPercent = Number(config.get("tax_percent") ?? 0);
      const [userCart] = await tx.select({ total: count() }).from(cartItems).where(eq(cartItems.userId, user.id));
      if (!userCart?.total) throw new Error("Your cart is empty.");
      const cart = await tx.select({
        productId: products.id, name: products.name, sku: products.sku, price: products.price,
        discountPrice: products.discountPrice, quantity: cartItems.quantity, imageUrl: productImages.url,
      }).from(cartItems).innerJoin(products, eq(cartItems.productId, products.id))
        .leftJoin(productImages, and(eq(productImages.productId, products.id), eq(productImages.isMain, true)))
        .where(and(eq(cartItems.userId, user.id), eq(products.isActive, true)));
      if (!cart.length) throw new Error("Your cart is empty.");
      const subtotal = cart.reduce((sum, item) => sum + (item.discountPrice ?? item.price) * item.quantity, 0);
      const shipping = subtotal >= shippingThreshold ? 0 : shippingCharge;
      const tax = Math.round(subtotal * taxPercent / 100);
      let discount = 0;
      let coupon: typeof coupons.$inferSelect | undefined;
      if (input.couponCode) {
        const [found] = await tx.select().from(coupons).where(eq(coupons.code, input.couponCode.toUpperCase())).limit(1);
        if (!found || !found.isActive || (found.expiresAt && found.expiresAt < new Date()) ||
            (found.maxUses !== null && found.usedCount >= found.maxUses) || subtotal < found.minOrder) {
          throw new Error("That coupon is invalid, expired, or not applicable to this order.");
        }
        coupon = found;
        discount = found.type === "percentage" ? Math.round(subtotal * found.value / 100) : Math.min(subtotal, found.value);
      }
      const codCharge = input.paymentMethod === "cod" ? env.COD_EXTRA_CHARGE : 0;
      const total = paymentAmountInPaise(Math.max(0, subtotal + shipping + tax + codCharge - discount));
      if (input.paymentMethod === "cod" && total > env.COD_MAX_ORDER_AMOUNT) {
        throw new Error("Cash on delivery is not available for orders above the COD limit.");
      }
      const serviceable = config.get("cod_serviceable_pincodes")?.split(",").map((value) => value.trim()).filter(Boolean);
      if (input.paymentMethod === "cod" && serviceable?.length && !serviceable.includes(address.pincode)) {
        throw new Error("Cash on delivery is not available for this pincode.");
      }
      const orderId = randomUUID();
      const reservedUntil = input.paymentMethod === "razorpay" ? paymentExpiryDate() : null;
      for (const item of cart) {
        const [reserved] = await tx.update(products).set({
          reservedStock: sql`${products.reservedStock} + ${item.quantity}`,
          updatedAt: new Date(),
        }).where(and(
          eq(products.id, item.productId),
          sql`${products.stock} - ${products.reservedStock} >= ${item.quantity}`,
        )).returning({ id: products.id });
        if (!reserved) throw new Error(`Not enough stock remains for ${item.name}. Please update your cart.`);
      }
      await tx.insert(orders).values({
        id: orderId, userId: user.id, addressId: address.id,
        status: input.paymentMethod === "cod" ? "confirmed" : "pending_payment",
        paymentStatus: input.paymentMethod === "cod" ? "created" : "created",
        paymentMethod: input.paymentMethod, reservedUntil, idempotencyKey,
        subtotal, shipping, tax, discount, total, couponCode: coupon?.code ?? null,
        shippingAddress: { name: address.name, phone: address.phone, line1: address.line1, line2: address.line2, city: address.city, state: address.state, pincode: address.pincode, country: address.country },
      });
      await tx.insert(orderItems).values(cart.map((item) => ({
        orderId, productId: item.productId, productName: item.name, sku: item.sku,
        quantity: item.quantity, unitPrice: item.discountPrice ?? item.price, imageUrl: item.imageUrl,
      })));
      const [payment] = await tx.insert(payments).values({
        orderId, userId: user.id, provider: input.paymentMethod, amount: total, status: input.paymentMethod === "cod" ? "created" : "created",
      }).returning({ id: payments.id });
      if (input.paymentMethod === "cod") {
        await finalizeReservedStock(tx, orderId);
        await tx.update(orders).set({ reservedUntil: null, paymentStatus: "created", updatedAt: new Date() }).where(eq(orders.id, orderId));
        await tx.delete(cartItems).where(eq(cartItems.userId, user.id));
      }
      return { orderId, total, paymentId: payment.id };
    });

    if (input.paymentMethod === "cod") {
      return NextResponse.json({ orderId: created.orderId, amount: created.total, currency: env.CURRENCY, razorpayOrderId: null, publicKeyId: null }, { status: 201 });
    }
    const razorpay = new Razorpay({ key_id: requireEnv("RAZORPAY_KEY_ID"), key_secret: requireEnv("RAZORPAY_KEY_SECRET") });
    const gatewayOrder = await razorpay.orders.create({
      amount: created.total, currency: env.CURRENCY, receipt: created.orderId.slice(0, 40),
      notes: { orderId: created.orderId, userId: user.id },
    });
    await db.update(payments).set({ providerOrderId: gatewayOrder.id, updatedAt: new Date() }).where(eq(payments.id, created.paymentId));
    return NextResponse.json({
      orderId: created.orderId, amount: created.total, currency: env.CURRENCY,
      razorpayOrderId: gatewayOrder.id, publicKeyId: requireEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID"),
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
