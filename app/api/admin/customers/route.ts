import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditLogs, orders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const q = new URL(request.url).searchParams.get("q")?.trim();
    const customers = await db.select({
      id: users.id, name: users.name, email: users.email, phone: users.phone,
      isBlocked: users.isBlocked, createdAt: users.createdAt, orderCount: sql<number>`count(${orders.id})::int`,
    }).from(users).leftJoin(orders, eq(users.id, orders.userId))
      .where(q ? and(eq(users.role, "user"), ilike(users.email, `%${q}%`)) : eq(users.role, "user"))
      .groupBy(users.id).orderBy(desc(users.createdAt)).limit(100);
    return NextResponse.json({ customers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdmin();
    const data = z.object({ id: z.uuid(), isBlocked: z.boolean() }).parse(await request.json());
    if (admin.id === data.id) return NextResponse.json({ error: "You cannot block your own admin account." }, { status: 400 });
    const user = await db.transaction(async (tx) => {
      const [target] = await tx.select().from(users)
        .where(and(eq(users.id, data.id), eq(users.role, "user"))).for("update").limit(1);
      if (!target || target.deletedAt) return undefined;
      if (target.isBlocked === data.isBlocked) return { id: target.id, isBlocked: target.isBlocked };
      const [updated] = await tx.update(users).set({
        isBlocked: data.isBlocked, sessionVersion: target.sessionVersion + 1, updatedAt: new Date(),
      }).where(eq(users.id, data.id)).returning({ id: users.id, isBlocked: users.isBlocked });
      await tx.insert(auditLogs).values({
        actorUserId: admin.id, targetUserId: data.id, action: data.isBlocked ? "user_blocked" : "user_unblocked",
        oldValue: { isBlocked: target.isBlocked }, newValue: { isBlocked: data.isBlocked },
      });
      return updated;
    });
    if (!user) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
