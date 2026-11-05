import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { auditLogs, users } from "@/db/schema";
import { requireUser, createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

export async function GET() {
  try {
    const session = await requireUser();
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, lastLoginAt: users.lastLoginAt })
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
      email: z.email().trim().toLowerCase().optional(),
      currentPassword: z.string().optional(), newPassword: z.string().min(10).max(128).optional(),
    }).refine((value) => Boolean(value.name || value.phone !== undefined || value.email || value.newPassword), "Update at least one profile field.");
    const data = schema.parse(await request.json());
    const [record] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
    if (!record) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    let passwordHash = record.passwordHash;
    const emailChanged = Boolean(data.email && data.email !== record.email);
    if (data.newPassword || emailChanged) {
      if (!data.currentPassword || !(await compare(data.currentPassword, record.passwordHash))) {
        return NextResponse.json({ error: "Your current password is incorrect." }, { status: 400 });
      }
      if (data.newPassword) passwordHash = await hash(data.newPassword, 12);
    }
    const [user] = await db.update(users).set({
      ...(data.name ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(emailChanged ? { email: data.email } : {}),
      passwordHash, ...(data.newPassword || emailChanged ? { sessionVersion: record.sessionVersion + 1 } : {}), updatedAt: new Date(),
    }).where(eq(users.id, session.id)).returning({
      id: users.id, name: users.name, email: users.email, role: users.role, sessionVersion: users.sessionVersion,
    });
    if (data.newPassword) {
      await db.insert(auditLogs).values({
        actorUserId: session.id, targetUserId: session.id, action: "password_changed",
      });
    }
    if (emailChanged) {
      await db.insert(auditLogs).values({
        actorUserId: session.id, targetUserId: session.id, action: "email_changed",
        oldValue: { email: record.email }, newValue: { email: user.email },
      });
    }
    await createSession(user);
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
