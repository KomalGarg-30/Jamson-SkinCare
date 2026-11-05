import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NextResponse } from "next/server";
import {
  addresses, auditLogs, cartItems, orderItems, orders, payments, products, returnItems, returns,
  reviews, users, wishlistItems,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";

const auditActor = alias(users, "audit_actor");

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsedId = z.uuid().safeParse(id);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
    const [user] = await db.select({
      id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role,
      isBlocked: users.isBlocked, deletedAt: users.deletedAt, createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    }).from(users).where(eq(users.id, parsedId.data)).limit(1);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const [userOrders, savedAddresses, cart, wishlist, userReviews, history, userReturns, paymentHistory] = await Promise.all([
      db.select().from(orders).where(eq(orders.userId, id)).orderBy(desc(orders.createdAt)),
      db.select().from(addresses).where(eq(addresses.userId, id)).orderBy(desc(addresses.isDefault)),
      db.select({
        productId: products.id, name: products.name, quantity: cartItems.quantity,
        price: products.price, discountPrice: products.discountPrice,
      }).from(cartItems).innerJoin(products, eq(cartItems.productId, products.id)).where(eq(cartItems.userId, id)),
      db.select({ productId: products.id, name: products.name, slug: products.slug, price: products.price })
        .from(wishlistItems).innerJoin(products, eq(wishlistItems.productId, products.id)).where(eq(wishlistItems.userId, id)),
      db.select({
        id: reviews.id, rating: reviews.rating, title: reviews.title, body: reviews.body,
        isApproved: reviews.isApproved, createdAt: reviews.createdAt, productId: reviews.productId,
        productName: products.name,
      }).from(reviews).innerJoin(products, eq(reviews.productId, products.id))
        .where(eq(reviews.userId, id)).orderBy(desc(reviews.createdAt)),
      db.select({
        id: auditLogs.id, actorUserId: auditLogs.actorUserId, action: auditLogs.action,
        oldValue: auditLogs.oldValue, newValue: auditLogs.newValue, createdAt: auditLogs.createdAt,
        actorName: auditActor.name, actorEmail: auditActor.email,
      }).from(auditLogs).leftJoin(auditActor, eq(auditLogs.actorUserId, auditActor.id))
        .where(eq(auditLogs.targetUserId, id)).orderBy(desc(auditLogs.createdAt)).limit(100),
      db.select().from(returns).where(eq(returns.userId, id)).orderBy(desc(returns.createdAt)),
      db.select({
        id: payments.id, orderId: payments.orderId, provider: payments.provider,
        providerOrderId: payments.providerOrderId, providerPaymentId: payments.providerPaymentId,
        amount: payments.amount, status: payments.status, createdAt: payments.createdAt,
      }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
        .where(eq(orders.userId, id)).orderBy(desc(payments.createdAt)),
    ]);

    const orderIds = userOrders.map((order) => order.id);
    const [items, userReturnItems] = await Promise.all([
      orderIds.length ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : Promise.resolve([]),
      userReturns.length ? db.select().from(returnItems).where(inArray(returnItems.returnId, userReturns.map((item) => item.id))) : Promise.resolve([]),
    ]);
    const paidOrders = userOrders.filter((order) => ["paid", "refunded"].includes(order.paymentStatus) && order.status !== "cancelled");
    const grossSpent = paidOrders.reduce((sum, order) => sum + order.total, 0);
    const totalRefunded = userReturns.filter((item) => item.status === "refunded").reduce((sum, item) => sum + item.refundAmount, 0);
    const totalSpent = Math.max(0, grossSpent - totalRefunded);
    const [returnsCount, returnedOrders] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(returns).where(eq(returns.userId, id)),
      db.select({ count: sql<number>`count(distinct ${returns.orderId})::int` }).from(returns)
        .where(and(eq(returns.userId, id), eq(returns.status, "refunded"))),
    ]);
    const deliveredOrders = userOrders.filter((order) => order.status === "delivered").length;

    return NextResponse.json({
      user, addresses: savedAddresses, orders: userOrders, items, returns: userReturns, returnItems: userReturnItems,
      payments: paymentHistory, cart, wishlist, reviews: userReviews, activity: history,
      stats: {
        lifetimeValue: totalSpent,
        averageOrderValue: paidOrders.length ? Math.round(totalSpent / paidOrders.length) : 0,
        returnCount: returnsCount[0].count,
        returnRate: deliveredOrders ? Math.round((returnedOrders[0].count / deliveredOrders) * 100) : 0,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("role"), role: z.enum(["user", "admin"]) }),
  z.object({ action: z.literal("status"), isBlocked: z.boolean() }),
  z.object({
    action: z.literal("edit"),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(30).nullable(),
  }),
  z.object({ action: z.literal("delete") }),
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const parsedId = z.uuid().safeParse(id);
    if (!parsedId.success) return NextResponse.json({ error: "Invalid user ID." }, { status: 400 });
    const data = updateSchema.parse(await request.json());
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(62104731)`);
      const [target] = await tx.select().from(users).where(eq(users.id, parsedId.data)).limit(1);
      if (!target || target.deletedAt) return { error: "User not found.", status: 404 as const };

      if (data.action === "role" && data.role !== target.role) {
        if (admin.id === parsedId.data && data.role !== "admin") return { error: "You cannot demote your own admin account.", status: 400 as const };
        if (target.role === "admin" && data.role === "user") {
          const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(users)
            .where(and(eq(users.role, "admin"), isNull(users.deletedAt)));
          if (count.count <= 1) return { error: "The last remaining admin cannot be demoted.", status: 409 as const };
        }
        await tx.update(users).set({ role: data.role, sessionVersion: target.sessionVersion + 1, updatedAt: new Date() })
          .where(eq(users.id, parsedId.data));
        await tx.insert(auditLogs).values({
          actorUserId: admin.id, targetUserId: parsedId.data, action: "role_changed",
          oldValue: { role: target.role }, newValue: { role: data.role },
        });
      } else if (data.action === "status" && data.isBlocked !== target.isBlocked) {
        if (admin.id === parsedId.data && data.isBlocked) return { error: "You cannot block your own admin account.", status: 400 as const };
        await tx.update(users).set({ isBlocked: data.isBlocked, sessionVersion: target.sessionVersion + 1, updatedAt: new Date() })
          .where(eq(users.id, parsedId.data));
        await tx.insert(auditLogs).values({
          actorUserId: admin.id, targetUserId: parsedId.data, action: data.isBlocked ? "user_blocked" : "user_unblocked",
          oldValue: { isBlocked: target.isBlocked }, newValue: { isBlocked: data.isBlocked },
        });
      } else if (data.action === "edit") {
        await tx.update(users).set({ name: data.name, phone: data.phone || null, updatedAt: new Date()         }).where(eq(users.id, parsedId.data));
        await tx.insert(auditLogs).values({
          actorUserId: admin.id, targetUserId: parsedId.data, action: "profile_updated",
          oldValue: { name: target.name, phone: target.phone }, newValue: { name: data.name, phone: data.phone || null },
        });
      } else if (data.action === "delete") {
        if (target.role === "admin") {
          const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(users)
            .where(and(eq(users.role, "admin"), isNull(users.deletedAt)));
          if (count.count <= 1) return { error: "The last remaining admin cannot be deleted.", status: 409 as const };
        }
        const now = new Date();
        await tx.update(users).set({ deletedAt: now, isBlocked: true, sessionVersion: target.sessionVersion + 1, updatedAt: now })
          .where(eq(users.id, parsedId.data));
        await tx.insert(auditLogs).values({
          actorUserId: admin.id, targetUserId: parsedId.data, action: "user_deleted",
          oldValue: { deletedAt: null, isBlocked: target.isBlocked }, newValue: { deletedAt: now.toISOString(), isBlocked: true },
        });
      }

      const [updated] = await tx.select({
        id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role,
        isBlocked: users.isBlocked, deletedAt: users.deletedAt,
      }).from(users).where(eq(users.id, parsedId.data)).limit(1);
      return { user: updated };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ user: result.user });
  } catch (error) {
    return errorResponse(error);
  }
}
