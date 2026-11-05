import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, returns, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";

const querySchema = z.object({
  q: z.string().trim().max(120).default(""),
  role: z.enum(["all", "user", "admin"]).default("all"),
  status: z.enum(["all", "active", "blocked"]).default("all"),
  sort: z.enum(["joined", "spent", "orders"]).default("joined"),
  page: z.coerce.number().int().min(1).default(1),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Invalid user search filters." }, { status: 400 });
    const { q, role, status, sort, page } = parsed.data;
    const conditions: SQL[] = [];
    if (q) conditions.push(or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.phone, `%${q}%`))!);
    if (role !== "all") conditions.push(eq(users.role, role));
    if (status === "active") conditions.push(and(eq(users.isBlocked, false), isNull(users.deletedAt))!);
    if (status === "blocked") conditions.push(and(eq(users.isBlocked, true), isNull(users.deletedAt))!);

    const spent = sql<number>`greatest(
      coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'refunded') then ${orders.total} else 0 end), 0)
      - coalesce((select sum(${returns.refundAmount}) from ${returns}
        where ${returns.userId} = ${users.id} and ${returns.status} = 'refunded'), 0), 0
    )::int`;
    const orderCount = sql<number>`count(${orders.id})::int`;
    const where = conditions.length ? and(...conditions) : undefined;
    const sortOrder = sort === "spent" ? desc(spent) : sort === "orders" ? desc(orderCount) : desc(users.createdAt);
    const [summary] = await db.select({
      totalUsers: sql<number>`count(*) filter (where ${users.deletedAt} is null)::int`,
      totalAdmins: sql<number>`count(*) filter (where ${users.role} = 'admin' and ${users.deletedAt} is null)::int`,
      blockedUsers: sql<number>`count(*) filter (where ${users.isBlocked} = true and ${users.deletedAt} is null)::int`,
      newThisMonth: sql<number>`count(*) filter (where ${users.createdAt} >= ${new Date(new Date().getFullYear(), new Date().getMonth(), 1)} and ${users.deletedAt} is null)::int`,
    }).from(users);
    const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(users).where(where);
    const list = await db.select({
      id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role,
      isBlocked: users.isBlocked, deletedAt: users.deletedAt, createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt, totalOrders: orderCount, totalSpent: spent,
    }).from(users).leftJoin(orders, eq(users.id, orders.userId)).where(where)
      .groupBy(users.id).orderBy(sortOrder, asc(users.name)).limit(20).offset((page - 1) * 20);
    return NextResponse.json({ users: list, summary, pagination: { page, pageSize: 20, total, pageCount: Math.ceil(total / 20) } });
  } catch (error) {
    return errorResponse(error);
  }
}
