import { and, asc, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { categories, products } from "@/db/schema";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const rawPage = Number(params.get("page") ?? 1);
    const rawLimit = Number(params.get("limit") ?? 12);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(48, Math.max(1, Math.floor(rawLimit))) : 12;
    const conditions = [eq(products.isActive, true), eq(categories.isActive, true)];
    const category = params.get("category");
    if (category) conditions.push(eq(categories.slug, category));
    const q = params.get("q")?.trim();
    if (q) conditions.push(or(ilike(products.name, `%${q}%`), ilike(products.description, `%${q}%`))!);
    const min = Number(params.get("min"));
    const max = Number(params.get("max"));
    const minRating = Number(params.get("rating"));
    if (Number.isFinite(min) && min > 0) conditions.push(gte(products.price, min));
    if (Number.isFinite(max) && max > 0) conditions.push(lte(products.price, max));
    if (Number.isFinite(minRating) && minRating > 0) conditions.push(gte(products.rating, minRating * 100));
    const sort = params.get("sort");
    const orderBy = sort === "price-asc" ? asc(products.price)
      : sort === "price-desc" ? desc(products.price)
      : sort === "popular" ? desc(products.reviewCount) : desc(products.createdAt);
    const rows = await db.select({
      id: products.id, name: products.name, slug: products.slug, description: products.description,
      price: products.price, discountPrice: products.discountPrice, stock: products.stock,
      rating: products.rating, reviewCount: products.reviewCount, featured: products.featured,
      categoryName: categories.name, categorySlug: categories.slug,
      image: sql<string | null>`(SELECT url FROM product_images WHERE product_id = ${products.id} ORDER BY position ASC LIMIT 1)`,
    }).from(products).innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions)).orderBy(orderBy).limit(limit).offset((page - 1) * limit);
    const total = await db.select({ count: sql<number>`count(distinct ${products.id})::int` })
      .from(products).innerJoin(categories, eq(products.categoryId, categories.id)).where(and(...conditions));
    const grouped = Array.from(new Map(rows.map((item) => [item.id, item])).values());
    return NextResponse.json({ products: grouped, total: total[0]?.count ?? 0, page, pages: Math.ceil((total[0]?.count ?? 0) / limit) });
  } catch (error) {
    return errorResponse(error);
  }
}
