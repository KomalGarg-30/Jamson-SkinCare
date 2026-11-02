import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { orders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const [customer] = await db.select({
      id: users.id, name: users.name, email: users.email, phone: users.phone,
      isBlocked: users.isBlocked, createdAt: users.createdAt,
    }).from(users).where(eq(users.id, id)).limit(1);
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    const history = await db.select().from(orders).where(eq(orders.userId, id)).orderBy(desc(orders.createdAt)).limit(100);
    return NextResponse.json({ customer, orders: history });
  } catch (error) {
    return errorResponse(error);
  }
}
