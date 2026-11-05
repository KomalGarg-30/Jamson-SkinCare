import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { NotFoundError } from "@imagekit/nodejs";
import { NextResponse } from "next/server";
import { categories, productImages, products } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { getImageKitClient, getImageKitConfig } from "@/lib/imagekit";
import { getEnv } from "@/lib/env";
import { slugify } from "@/lib/utils";
import { z } from "zod";

const imageSchema = z.object({
  url: z.url(),
  fileId: z.string().min(1).max(200),
  altText: z.string().trim().max(255).default(""),
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(200), slug: z.string().trim().min(2).max(220).optional(),
  description: z.string().min(10), ingredients: z.string().optional(), howToUse: z.string().optional(),
  categoryId: z.uuid(), brand: z.string().min(1).max(100), price: z.number().int().positive(),
  discountPrice: z.number().int().positive().nullable().optional(), sku: z.string().min(2).max(80),
  stock: z.number().int().min(0), featured: z.boolean().default(false), isActive: z.boolean().default(true),
  tags: z.array(z.string().max(40)).max(20).default([]), images: z.array(imageSchema).max(20).optional(),
}).refine((data) => data.discountPrice == null || data.discountPrice < data.price, {
  path: ["discountPrice"],
  message: "Sale price must be less than the regular price.",
});

async function validateImages(images: z.infer<typeof imageSchema>[], isActive: boolean) {
  const { MAX_IMAGES_PER_PRODUCT } = getEnv();
  if (images.length > MAX_IMAGES_PER_PRODUCT) {
    return `A product can have up to ${MAX_IMAGES_PER_PRODUCT} images.`;
  }
  if (isActive && images.length === 0) return "Add at least one product image before publishing.";
  if (!images.length) return null;
  const config = getImageKitConfig();
  const ids = new Set(images.map((image) => image.fileId));
  if (ids.size !== images.length) return "The same image cannot be added more than once.";
  const client = getImageKitClient();
  const endpoint = new URL(config.urlEndpoint);
  for (const image of images) {
    const url = new URL(image.url);
    if (url.protocol !== "https:" || url.hostname !== endpoint.hostname) return "Product images must be hosted on ImageKit.";
    const file = await client.files.get(image.fileId);
    if (!file.filePath?.startsWith(`${config.folder}/`)) return "A product image is outside the configured ImageKit folder.";
    if (file.fileType !== "image" || !["image/jpeg", "image/png", "image/webp"].includes(file.mime || "")) {
      return "Product images must be JPG, PNG, or WEBP files.";
    }
    if (typeof file.size === "number" && file.size > config.maxImageSizeMb * 1024 * 1024) {
      return `Each image must be no larger than ${config.maxImageSizeMb} MB.`;
    }
    const endpointPath = decodeURIComponent(endpoint.pathname).replace(/\/$/, "");
    const imagePath = decodeURIComponent(url.pathname).slice(endpointPath.length);
    if (imagePath !== file.filePath) return "The image URL does not match its ImageKit file ID.";
  }
  return null;
}

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
    const imageRows = rows.length ? await db.select().from(productImages)
      .where(inArray(productImages.productId, rows.map((row) => row.id)))
      .orderBy(productImages.position) : [];
    const imageMap = new Map<string, typeof imageRows>();
    for (const image of imageRows) imageMap.set(image.productId, [...(imageMap.get(image.productId) || []), image]);
    const total = countRows[0]?.total ?? 0;
    return NextResponse.json({ products: rows.map((row) => ({ ...row, images: imageMap.get(row.id) || [] })), total, page, pages: Math.ceil(total / 20) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const data = productSchema.parse(await request.json());
    const images = data.images ?? [];
    const imageError = await validateImages(images, data.isActive);
    if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });
    const category = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, data.categoryId)).limit(1);
    if (!category.length) return NextResponse.json({ error: "Select a valid category." }, { status: 400 });
    const values = { ...data };
    delete values.images;
    const result = await db.transaction(async (tx) => {
      const [product] = await tx.insert(products).values({
        ...values, slug: data.slug ? slugify(data.slug) : slugify(data.name),
        discountPrice: data.discountPrice ?? null,
      }).returning();
      if (images.length) await tx.insert(productImages).values(images.map((image, position) => ({
        productId: product.id, ...image, position, isMain: position === 0,
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
    const [existing] = await db.select({ price: products.price, discountPrice: products.discountPrice, isActive: products.isActive })
      .from(products).where(eq(products.id, body.id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const price = data.price ?? existing.price;
    const discountPrice = data.discountPrice === undefined ? existing.discountPrice : data.discountPrice;
    if (discountPrice !== null && discountPrice >= price) {
      return NextResponse.json({ error: "Sale price must be less than the regular price." }, { status: 400 });
    }
    const images = data.images;
    if (images) {
      const imageError = await validateImages(images, data.isActive ?? existing.isActive);
      if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });
    }
    if (data.isActive === true && !images) {
      const [imageCount] = await db.select({ count: sql<number>`count(*)::int` }).from(productImages)
        .where(eq(productImages.productId, body.id));
      if (!imageCount?.count) return NextResponse.json({ error: "Add at least one product image before publishing." }, { status: 400 });
    }
    if (images) {
      const existingImages = await db.select({ fileId: productImages.fileId }).from(productImages)
        .where(eq(productImages.productId, body.id));
      const incomingFileIds = new Set(images.map((image) => image.fileId));
      if (existingImages.some((image) => image.fileId && !incomingFileIds.has(image.fileId))) {
        return NextResponse.json({ error: "Remove stored images using the image manager so their ImageKit files are deleted too." }, { status: 400 });
      }
    }
    const values = { ...data };
    delete values.images;
    const product = await db.transaction(async (tx) => {
      const [updated] = await tx.update(products).set({
        ...values, ...(values.name && !values.slug ? { slug: slugify(values.name) } : {}),
        ...(values.slug ? { slug: slugify(values.slug) } : {}), updatedAt: new Date(),
      }).where(eq(products.id, body.id)).returning();
      if (images) {
        await tx.delete(productImages).where(eq(productImages.productId, body.id));
        if (images.length) await tx.insert(productImages).values(images.map((image, position) => ({
          productId: body.id, ...image, position, isMain: position === 0,
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
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const images = await db.select({ fileId: productImages.fileId }).from(productImages).where(eq(productImages.productId, id));
    const storedFileIds = images.map((image) => image.fileId).filter((fileId): fileId is string => Boolean(fileId));
    if (storedFileIds.length) {
      const imageKit = getImageKitClient();
      for (const fileId of storedFileIds) {
        try {
          await imageKit.files.delete(fileId);
        } catch (error) {
          if (!(error instanceof NotFoundError)) throw error;
        }
      }
    }
    await db.delete(products).where(and(eq(products.id, id)));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
