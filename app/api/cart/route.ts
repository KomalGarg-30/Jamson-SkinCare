import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { cartItems, productImages, products, settings } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { addCartSchema } from "@/lib/validation";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await db.select({
      id: cartItems.id, quantity: cartItems.quantity, productId: products.id, name: products.name,
      slug: products.slug, price: products.price, discountPrice: products.discountPrice, stock: products.stock,
      image: productImages.url,
    }).from(cartItems).innerJoin(products, eq(cartItems.productId, products.id))
      .leftJoin(productImages, eq(productImages.productId, products.id))
      .where(and(eq(cartItems.userId, user.id), eq(products.isActive, true)));
    const distinctItems = Array.from(new Map(items.map((item) => [item.id, item])).values());
    const subtotal = distinctItems.reduce((sum, item) => sum + (item.discountPrice ?? item.price) * item.quantity, 0);
    const configRows = await db.select().from(settings);
    const config = new Map(configRows.map((row) => [row.key, row.value]));
    const shipping = subtotal >= Number(config.get("free_shipping_threshold") ?? 200000) ? 0 : Number(config.get("shipping_charge") ?? 9900);
    const tax = Math.round(subtotal * Number(config.get("tax_percent") ?? 0) / 100);
    return NextResponse.json({ items: distinctItems, subtotal, shipping, tax, total: subtotal + shipping + tax });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = addCartSchema.parse(await request.json());
    const [product] = await db.select().from(products).where(and(eq(products.id, data.productId), eq(products.isActive, true))).limit(1);
    if (!product) return NextResponse.json({ error: "This product is no longer available." }, { status: 404 });
    const [existing] = await db.select().from(cartItems).where(and(eq(cartItems.userId, user.id), eq(cartItems.productId, data.productId))).limit(1);
    const quantity = (existing?.quantity ?? 0) + data.quantity;
    if (quantity > product.stock) return NextResponse.json({ error: `Only ${product.stock} item(s) are currently in stock.` }, { status: 409 });
    if (existing) {
      await db.update(cartItems).set({ quantity, updatedAt: new Date() }).where(eq(cartItems.id, existing.id));
    } else {
      await db.insert(cartItems).values({ userId: user.id, productId: data.productId, quantity });
    }
    return NextResponse.json({ success: true, quantity });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("id" in body) || !("quantity" in body) ||
        typeof body.id !== "string" || typeof body.quantity !== "number" || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 20) {
      return NextResponse.json({ error: "Choose a quantity between 1 and 20." }, { status: 400 });
    }
    const [item] = await db.select({ id: cartItems.id, stock: products.stock })
      .from(cartItems).innerJoin(products, eq(cartItems.productId, products.id))
      .where(and(eq(cartItems.id, body.id), eq(cartItems.userId, user.id))).limit(1);
    if (!item) return NextResponse.json({ error: "Cart item not found." }, { status: 404 });
    if (body.quantity > item.stock) return NextResponse.json({ error: `Only ${item.stock} item(s) are in stock.` }, { status: 409 });
    await db.update(cartItems).set({ quantity: body.quantity, updatedAt: new Date() }).where(eq(cartItems.id, item.id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Cart item id is required." }, { status: 400 });
    await db.delete(cartItems).where(and(eq(cartItems.id, id), eq(cartItems.userId, user.id)));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
