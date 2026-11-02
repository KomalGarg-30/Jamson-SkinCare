import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { categories, productImages, products } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { slugify } from "@/lib/utils";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().trim().min(2).max(200), slug: z.string().trim().min(2).max(220).optional(),
  description: z.string().min(10), ingredients: z.string().optional(), howToUse: z.string().optional(),
  categoryId: z.uuid(), brand: z.string().min(1).max(100), price: z.number().int().positive(),
  discountPrice: z.number().int().positive().nullable().optional(), sku: z.string().min(2).max(80),
  stock: z.number().int().min(0), featured: z.boolean().default(false), isActive: z.boolean().default(true),
  tags: z.array(z.string().max(40)).max(20).default([]), images: z.array(z.object({ url: z.url(), alt: z.string().max(255) })).max(10).default([]),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams;
    const requestedPage = Number(params.get("page") ?? 1);
    const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
    const q = params.get("q")?.trim();
    const conditions = q ? ilike(products.name, `%${q}%`) : undefined;
    const [rows, countRows] = await Promise.all([
      db.select().from(products).where(conditions).orderBy(desc(products.createdAt)).limit(20).offset((page - 1) * 20),
      db.select({ total: sql<number>`count(*)::int` }).from(products).where(conditions),
    ]);
    const total = countRows[0]?.total ?? 0;
    return NextResponse.json({ products: rows, total, page, pages: Math.ceil(total / 20) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const data = productSchema.parse(await request.json());
    const category = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, data.categoryId)).limit(1);
    if (!category.length) return NextResponse.json({ error: "Select a valid category." }, { status: 400 });
    const result = await db.transaction(async (tx) => {
      const [product] = await tx.insert(products).values({
        ...data, slug: data.slug ? slugify(data.slug) : slugify(data.name),
        discountPrice: data.discountPrice ?? null,
      }).returning();
      if (data.images.length) await tx.insert(productImages).values(data.images.map((image, position) => ({
        productId: product.id, ...image, position,
      })));
      return product;
    });
    return NextResponse.json({ product: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = z.object({ id: z.uuid() }).passthrough().parse(await request.json());
    const data = productSchema.partial().parse(body);
    const { images, ...values } = data;
    const product = await db.transaction(async (tx) => {
      const [updated] = await tx.update(products).set({
        ...values, ...(values.name && !values.slug ? { slug: slugify(values.name) } : {}),
        ...(values.slug ? { slug: slugify(values.slug) } : {}), updatedAt: new Date(),
      }).where(eq(products.id, body.id)).returning();
      if (images) {
        await tx.delete(productImages).where(eq(productImages.productId, body.id));
        if (images.length) await tx.insert(productImages).values(images.map((image, position) => ({
          productId: body.id, ...image, position,
        })));
      }
      return updated;
    });
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ product });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Product id is required." }, { status: 400 });
    await db.delete(products).where(and(eq(products.id, id)));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
