import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { productImages, products, wishlistItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await db.select({
      id: wishlistItems.id, productId: products.id, name: products.name, slug: products.slug,
      price: products.price, discountPrice: products.discountPrice, image: productImages.url,
    }).from(wishlistItems).innerJoin(products, eq(wishlistItems.productId, products.id))
      .leftJoin(productImages, eq(productImages.productId, products.id))
      .where(and(eq(wishlistItems.userId, user.id), eq(products.isActive, true)));
    return NextResponse.json({ items: Array.from(new Map(items.map((item) => [item.id, item])).values()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { productId } = z.object({ productId: z.uuid() }).parse(await request.json());
    const [existing] = await db.select().from(wishlistItems).where(and(eq(wishlistItems.userId, user.id), eq(wishlistItems.productId, productId))).limit(1);
    if (existing) await db.delete(wishlistItems).where(eq(wishlistItems.id, existing.id));
    else await db.insert(wishlistItems).values({ userId: user.id, productId });
    return NextResponse.json({ wishlisted: !existing });
  } catch (error) {
    return errorResponse(error);
  }
}
