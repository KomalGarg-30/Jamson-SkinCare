import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { banners } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(2).max(160), subtitle: z.string().optional(), imageUrl: z.url(),
  linkUrl: z.url().optional().or(z.literal("")), isActive: z.boolean().default(true), position: z.number().int().min(0).default(0),
});

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ banners: await db.select().from(banners).orderBy(asc(banners.position)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const [banner] = await db.insert(banners).values(schema.parse(await request.json())).returning();
    return NextResponse.json({ banner }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string") {
      return NextResponse.json({ error: "Banner id is required." }, { status: 400 });
    }
    const { id, ...payload } = body;
    const values = schema.partial().parse(payload);
    const [banner] = await db.update(banners).set({ ...values, updatedAt: new Date() })
      .where(eq(banners.id, id)).returning();
    if (!banner) return NextResponse.json({ error: "Banner not found." }, { status: 404 });
    return NextResponse.json({ banner });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Banner id is required." }, { status: 400 });
    await db.delete(banners).where(eq(banners.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
