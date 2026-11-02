import { and, count, desc, eq, gte, lt, sql, sum } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, products, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const period = new URL(request.url).searchParams.get("period");
    const unit = period === "weekly" ? "week" : period === "monthly" ? "month" : "day";
    const lookbackDays = unit === "day" ? 30 : unit === "week" ? 365 : 1095;
    const dateBucket = sql`date_trunc(${sql.raw(`'${unit}'`)}, ${orders.createdAt})`;
    const [[revenue], [orderCount], [customerCount], [lowStock], recentOrders, chart] = await Promise.all([
      db.select({ total: sum(orders.total) }).from(orders).where(eq(orders.paymentStatus, "paid")),
      db.select({ count: count() }).from(orders),
      db.select({ count: count() }).from(users).where(eq(users.role, "user")),
      db.select({ count: count() }).from(products).where(lt(products.stock, 10)),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
      db.select({
        date: sql<string>`to_char(${dateBucket}, 'YYYY-MM-DD')`,
        revenue: sum(orders.total),
      }).from(orders).where(and(eq(orders.paymentStatus, "paid"), gte(orders.createdAt, sql`now() - (${lookbackDays} * interval '1 day')`)))
        .groupBy(dateBucket).orderBy(dateBucket).limit(30),
    ]);
    return NextResponse.json({
      revenue: Number(revenue.total ?? 0), orders: orderCount.count, customers: customerCount.count,
      lowStock: lowStock.count, recentOrders, chart,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
