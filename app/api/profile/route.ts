import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { users } from "@/db/schema";
import { requireUser, createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

export async function GET() {
  try {
    const session = await requireUser();
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.id, session.id)).limit(1);
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireUser();
    const schema = z.object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().min(7).max(30).or(z.literal("")).nullable().optional(),
      currentPassword: z.string().optional(), newPassword: z.string().min(10).max(128).optional(),
    }).refine((value) => Boolean(value.name || value.phone !== undefined || value.newPassword), "Update at least one profile field.");
    const data = schema.parse(await request.json());
    const [record] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
    if (!record) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    let passwordHash = record.passwordHash;
    if (data.newPassword) {
      if (!data.currentPassword || !(await compare(data.currentPassword, record.passwordHash))) {
        return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });
      }
      passwordHash = await hash(data.newPassword, 12);
    }
    const [user] = await db.update(users).set({
      ...(data.name ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      passwordHash, updatedAt: new Date(),
    }).where(eq(users.id, session.id)).returning({ id: users.id, name: users.name, email: users.email, role: users.role });
    await createSession(user);
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
