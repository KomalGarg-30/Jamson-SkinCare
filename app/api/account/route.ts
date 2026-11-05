import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  addresses, auditLogs, cartItems, orderItems, orders, payments, products, returnItems, returns,
  reviews, users, wishlistItems,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/api";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireUser();
    const [userProfile, userOrders, savedAddresses, cart, wishlist, userReviews, userReturns, paymentHistory, activity] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
        .from(users).where(eq(users.id, user.id)).limit(1),
      db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt)),
      db.select().from(addresses).where(eq(addresses.userId, user.id)).orderBy(desc(addresses.isDefault)),
      db.select({
        productId: products.id, name: products.name, slug: products.slug, quantity: cartItems.quantity,
        price: products.price, discountPrice: products.discountPrice, stock: products.stock,
        image: sql<string | null>`(SELECT url FROM product_images WHERE product_id = ${products.id} ORDER BY position ASC LIMIT 1)`,
      }).from(cartItems).innerJoin(products, eq(cartItems.productId, products.id))
        .where(eq(cartItems.userId, user.id)),
      db.select({ productId: products.id, name: products.name, slug: products.slug, price: products.price,
        image: sql<string | null>`(SELECT url FROM product_images WHERE product_id = ${products.id} ORDER BY position ASC LIMIT 1)` })
        .from(wishlistItems).innerJoin(products, eq(wishlistItems.productId, products.id)).where(eq(wishlistItems.userId, user.id)),
      db.select({
        id: reviews.id, productId: reviews.productId, orderId: reviews.orderId, rating: reviews.rating,
        title: reviews.title, body: reviews.body, isApproved: reviews.isApproved, createdAt: reviews.createdAt,
        productName: products.name,
      }).from(reviews).innerJoin(products, eq(reviews.productId, products.id))
        .where(eq(reviews.userId, user.id)).orderBy(desc(reviews.createdAt)),
      db.select().from(returns).where(eq(returns.userId, user.id)).orderBy(desc(returns.createdAt)),
      db.select({
        id: payments.id, orderId: payments.orderId, provider: payments.provider,
        providerPaymentId: payments.providerPaymentId, amount: payments.amount, status: payments.status,
        createdAt: payments.createdAt,
      }).from(payments).innerJoin(orders, eq(payments.orderId, orders.id))
        .where(eq(orders.userId, user.id)).orderBy(desc(payments.createdAt)),
      db.select({
        id: auditLogs.id, action: auditLogs.action, oldValue: auditLogs.oldValue,
        newValue: auditLogs.newValue, createdAt: auditLogs.createdAt,
      }).from(auditLogs).where(eq(auditLogs.targetUserId, user.id)).orderBy(desc(auditLogs.createdAt)).limit(20),
    ]);

    const orderIds = userOrders.map((order) => order.id);
    const [items, returnProducts] = await Promise.all([
      orderIds.length ? db.select({
        id: orderItems.id, orderId: orderItems.orderId, productId: orderItems.productId,
        productName: orderItems.productName, quantity: orderItems.quantity, unitPrice: orderItems.unitPrice,
        image: sql<string | null>`(SELECT url FROM product_images WHERE product_id = ${orderItems.productId} ORDER BY position ASC LIMIT 1)`,
      }).from(orderItems).where(inArray(orderItems.orderId, orderIds)) : Promise.resolve([]),
      userReturns.length ? db.select({
        returnId: returnItems.returnId, orderItemId: returnItems.orderItemId, quantity: returnItems.quantity,
        productName: orderItems.productName, unitPrice: orderItems.unitPrice,
      }).from(returnItems).innerJoin(orderItems, eq(returnItems.orderItemId, orderItems.id))
        .where(inArray(returnItems.returnId, userReturns.map((item) => item.id))) : Promise.resolve([]),
    ]);
    const paidOrders = userOrders.filter((order) => ["paid", "refunded"].includes(order.paymentStatus) && order.status !== "cancelled");
    const grossSpent = paidOrders.reduce((sum, order) => sum + order.total, 0);
    const refundedTotal = userReturns.filter((item) => item.status === "refunded").reduce((sum, item) => sum + item.refundAmount, 0);
    const totalSpent = Math.max(0, grossSpent - refundedTotal);
    const activeReturns = userReturns.filter((item) => !["refunded", "rejected"].includes(item.status)).length;
    return NextResponse.json({
      user: userProfile[0], orders: userOrders, items, addresses: savedAddresses, cart, wishlist,
      reviews: userReviews, returns: userReturns, returnItems: returnProducts, payments: paymentHistory, activity,
      stats: {
        totalOrders: userOrders.length, totalSpent, activeReturns,
        averageOrderValue: paidOrders.length ? Math.round(totalSpent / paidOrders.length) : 0,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const user = await requireUser();
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(62104731)`);
      if (user.role === "admin") {
        const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(users)
          .where(and(eq(users.role, "admin"), isNull(users.deletedAt)));
        if (count.count <= 1) return false;
      }
      const now = new Date();
      await tx.update(users).set({
        deletedAt: now, isBlocked: true, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: now,
      }).where(eq(users.id, user.id));
      await tx.insert(auditLogs).values({
        actorUserId: user.id, targetUserId: user.id, action: "account_deletion_requested",
        oldValue: { isBlocked: false, deletedAt: null },
        newValue: { isBlocked: true, deletedAt: now.toISOString() },
      });
      return true;
    });
    if (!result) return NextResponse.json({ error: "The last remaining admin cannot be deleted." }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
