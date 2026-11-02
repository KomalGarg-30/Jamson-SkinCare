import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { addresses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { addressSchema } from "@/lib/validation";
import { z } from "zod";

export async function GET() {
  try {
    const user = await requireUser();
    const list = await db.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(addresses.isDefault);
    return NextResponse.json({ addresses: list.reverse() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = addressSchema.parse(await request.json());
    const result = await db.transaction(async (tx) => {
      if (data.isDefault) await tx.update(addresses).set({ isDefault: false, updatedAt: new Date() }).where(eq(addresses.userId, user.id));
      const [address] = await tx.insert(addresses).values({ ...data, userId: user.id }).returning();
      return address;
    });
    return NextResponse.json({ address: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = z.object({ id: z.uuid() }).passthrough().parse(await request.json());
    const values = addressSchema.partial().parse(body);
    const address = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: addresses.id }).from(addresses)
        .where(and(eq(addresses.id, body.id), eq(addresses.userId, user.id))).limit(1);
      if (!existing) return undefined;
      if (values.isDefault) await tx.update(addresses).set({ isDefault: false, updatedAt: new Date() }).where(eq(addresses.userId, user.id));
      const [updated] = await tx.update(addresses).set({ ...values, updatedAt: new Date() })
        .where(and(eq(addresses.id, body.id), eq(addresses.userId, user.id))).returning();
      return updated;
    });
    if (!address) return NextResponse.json({ error: "Address not found." }, { status: 404 });
    return NextResponse.json({ address });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Address id is required." }, { status: 400 });
    await db.delete(addresses).where(and(eq(addresses.id, id), eq(addresses.userId, user.id)));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
