import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { categories, productImages, products, reviews, users } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const [product] = await db.select().from(products).innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.slug, slug), eq(products.isActive, true), eq(categories.isActive, true))).limit(1);
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const [images, productReviews] = await Promise.all([
      db.select().from(productImages).where(eq(productImages.productId, product.products.id)).orderBy(productImages.position),
      db.select({ id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body, createdAt: reviews.createdAt, customer: users.name })
        .from(reviews).innerJoin(users, eq(reviews.userId, users.id))
        .where(and(eq(reviews.productId, product.products.id), eq(reviews.isApproved, true))),
    ]);
    return NextResponse.json({ ...product, images, reviews: productReviews });
  } catch (error) {
    return errorResponse(error);
  }
}
