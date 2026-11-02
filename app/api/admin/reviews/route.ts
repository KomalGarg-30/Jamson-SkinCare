import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { products, reviews, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

export async function GET() {
  try {
    await requireAdmin();
    const list = await db.select({
      id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body,
      isApproved: reviews.isApproved, createdAt: reviews.createdAt, productName: products.name, customerName: users.name,
    }).from(reviews).innerJoin(products, eq(reviews.productId, products.id))
      .innerJoin(users, eq(reviews.userId, users.id)).orderBy(desc(reviews.createdAt)).limit(100);
    return NextResponse.json({ reviews: list });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const data = z.object({ id: z.uuid(), isApproved: z.boolean() }).parse(await request.json());
    const [review] = await db.update(reviews).set({ isApproved: data.isApproved, updatedAt: new Date() })
      .where(eq(reviews.id, data.id)).returning();
    if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
    const totals = await db.select().from(reviews).where(and(eq(reviews.productId, review.productId), eq(reviews.isApproved, true)));
    await db.update(products).set({
      reviewCount: totals.length, rating: totals.length ? Math.round(totals.reduce((sum, item) => sum + item.rating, 0) * 100 / totals.length) : 0,
    }).where(eq(products.id, review.productId));
    return NextResponse.json({ review });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Review id is required." }, { status: 400 });
    const [review] = await db.delete(reviews).where(eq(reviews.id, id)).returning({ productId: reviews.productId });
    if (review) {
      const approved = await db.select({ rating: reviews.rating }).from(reviews)
        .where(and(eq(reviews.productId, review.productId), eq(reviews.isApproved, true)));
      await db.update(products).set({
        reviewCount: approved.length,
        rating: approved.length ? Math.round(approved.reduce((sum, item) => sum + item.rating, 0) * 100 / approved.length) : 0,
      }).where(eq(products.id, review.productId));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
