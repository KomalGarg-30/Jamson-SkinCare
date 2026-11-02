import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { coupons } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  code: z.string().trim().min(3).max(50).transform((value) => value.toUpperCase()),
  type: z.enum(["percentage", "fixed"]), value: z.number().int().positive(),
  minOrder: z.number().int().min(0).default(0), maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(), isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ coupons: await db.select().from(coupons).orderBy(desc(coupons.createdAt)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const data = schema.parse(await request.json());
    if (data.type === "percentage" && data.value > 100) return NextResponse.json({ error: "Percentage coupons cannot exceed 100%." }, { status: 400 });
    const [coupon] = await db.insert(coupons).values({
      ...data, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null, maxUses: data.maxUses ?? null,
    }).returning();
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string") {
      return NextResponse.json({ error: "Coupon id is required." }, { status: 400 });
    }
    const { id, ...payload } = body;
    const data = schema.partial().parse(payload);
    const { expiresAt, ...fields } = data;
    const [coupon] = await db.update(coupons).set({
      ...fields, ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
      updatedAt: new Date(),
    }).where(eq(coupons.id, id)).returning();
    if (!coupon) return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    return NextResponse.json({ coupon });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Coupon id is required." }, { status: 400 });
    await db.delete(coupons).where(eq(coupons.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
