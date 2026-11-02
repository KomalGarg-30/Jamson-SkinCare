import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { categories } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { slugify } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2).max(100), slug: z.string().optional(), description: z.string().optional(),
  imageUrl: z.union([z.url(), z.string().startsWith("/")]).optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ categories: await db.select().from(categories).orderBy(asc(categories.name)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const data = schema.parse(await request.json());
    const [category] = await db.insert(categories).values({
      ...data, slug: slugify(data.slug || data.name), imageUrl: data.imageUrl || null,
    }).returning();
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string") {
      return NextResponse.json({ error: "Category id is required." }, { status: 400 });
    }
    const { id, ...raw } = body;
    const data = schema.partial().parse(raw);
    const [category] = await db.update(categories).set({
      ...data, ...(data.slug || data.name ? { slug: slugify(data.slug || data.name!) } : {}),
      updatedAt: new Date(),
    }).where(eq(categories.id, id)).returning();
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    return NextResponse.json({ category });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Category id is required." }, { status: 400 });
    await db.delete(categories).where(eq(categories.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
