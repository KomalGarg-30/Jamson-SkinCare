import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const orderStatus = pgEnum("order_status", ["pending", "confirmed", "shipped", "delivered", "cancelled"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "refunded"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: varchar("phone", { length: 30 }),
  role: userRole("role").default("user").notNull(),
  isBlocked: boolean("is_blocked").default(false).notNull(),
  ...timestamps,
}, (table) => [index("users_role_idx").on(table.role)]);

export const addresses = pgTable("addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 30 }).notNull(),
  line1: varchar("line1", { length: 255 }).notNull(),
  line2: varchar("line2", { length: 255 }),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 100 }).notNull(),
  pincode: varchar("pincode", { length: 20 }).notNull(),
  country: varchar("country", { length: 100 }).default("India").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  ...timestamps,
}, (table) => [
  index("addresses_user_idx").on(table.userId),
  uniqueIndex("addresses_one_default_per_user_idx").on(table.userId).where(sql`${table.isDefault}`),
]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
});

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull().unique(),
  description: text("description").notNull(),
  ingredients: text("ingredients"),
  howToUse: text("how_to_use"),
  brand: varchar("brand", { length: 100 }).notNull(),
  price: integer("price").notNull(),
  discountPrice: integer("discount_price"),
  sku: varchar("sku", { length: 80 }).notNull().unique(),
  stock: integer("stock").default(0).notNull(),
  rating: integer("rating").default(0).notNull(),
  reviewCount: integer("review_count").default(0).notNull(),
  featured: boolean("featured").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  tags: text("tags").array().default([]).notNull(),
  ...timestamps,
}, (table) => [
  index("products_category_idx").on(table.categoryId),
  index("products_active_idx").on(table.isActive),
  check("products_price_positive", sql`${table.price} > 0`),
  check("products_discount_price_valid", sql`${table.discountPrice} IS NULL OR (${table.discountPrice} > 0 AND ${table.discountPrice} < ${table.price})`),
  check("products_stock_nonnegative", sql`${table.stock} >= 0`),
  check("products_rating_range", sql`${table.rating} BETWEEN 0 AND 500`),
]);

export const productImages = pgTable("product_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 255 }).notNull(),
  position: integer("position").default(0).notNull(),
  ...timestamps,
}, (table) => [index("product_images_product_idx").on(table.productId)]);

export const cartItems = pgTable("cart_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("cart_items_user_product_idx").on(table.userId, table.productId),
  index("cart_items_user_idx").on(table.userId),
  check("cart_items_quantity_positive", sql`${table.quantity} BETWEEN 1 AND 20`),
]);

export const wishlistItems = pgTable("wishlist_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  ...timestamps,
}, (table) => [uniqueIndex("wishlist_user_product_idx").on(table.userId, table.productId)]);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  addressId: uuid("address_id").references(() => addresses.id, { onDelete: "set null" }),
  status: orderStatus("status").default("pending").notNull(),
  paymentStatus: paymentStatus("payment_status").default("pending").notNull(),
  paymentMethod: varchar("payment_method", { length: 30 }).notNull(),
  subtotal: integer("subtotal").notNull(),
  shipping: integer("shipping").notNull(),
  tax: integer("tax").notNull(),
  discount: integer("discount").default(0).notNull(),
  total: integer("total").notNull(),
  couponCode: varchar("coupon_code", { length: 50 }),
  shippingAddress: jsonb("shipping_address").notNull(),
  ...timestamps,
}, (table) => [
  index("orders_user_idx").on(table.userId),
  index("orders_status_idx").on(table.status),
  index("orders_created_idx").on(table.createdAt),
  check("orders_amounts_nonnegative", sql`${table.subtotal} >= 0 AND ${table.shipping} >= 0 AND ${table.tax} >= 0 AND ${table.discount} >= 0 AND ${table.total} >= 0`),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  productName: varchar("product_name", { length: 200 }).notNull(),
  sku: varchar("sku", { length: 80 }).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  ...timestamps,
}, (table) => [
  index("order_items_order_idx").on(table.orderId),
  check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  check("order_items_unit_price_nonnegative", sql`${table.unitPrice} >= 0`),
]);

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 30 }).notNull(),
  providerOrderId: varchar("provider_order_id", { length: 120 }),
  providerPaymentId: varchar("provider_payment_id", { length: 120 }),
  signature: text("signature"),
  amount: integer("amount").notNull(),
  status: paymentStatus("status").default("pending").notNull(),
  ...timestamps,
}, (table) => [
  index("payments_order_idx").on(table.orderId),
  uniqueIndex("payments_provider_order_idx").on(table.providerOrderId).where(sql`${table.providerOrderId} IS NOT NULL`),
]);

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  title: varchar("title", { length: 160 }),
  body: text("body").notNull(),
  isApproved: boolean("is_approved").default(false).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("reviews_purchase_idx").on(table.productId, table.userId, table.orderId),
  check("reviews_rating_range", sql`${table.rating} BETWEEN 1 AND 5`),
]);

export const coupons = pgTable("coupons", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  type: varchar("type", { length: 20 }).notNull(),
  value: integer("value").notNull(),
  minOrder: integer("min_order").default(0).notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
}, (table) => [
  check("coupons_type_valid", sql`${table.type} IN ('percentage', 'fixed')`),
  check("coupons_value_positive", sql`${table.value} > 0`),
  check("coupons_usage_nonnegative", sql`${table.usedCount} >= 0 AND (${table.maxUses} IS NULL OR ${table.usedCount} <= ${table.maxUses})`),
]);

export const banners = pgTable("banners", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  subtitle: text("subtitle"),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url"),
  isActive: boolean("is_active").default(true).notNull(),
  position: integer("position").default(0).notNull(),
  ...timestamps,
});

export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  ...timestamps,
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("reset_tokens_user_idx").on(table.userId)]);

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  ...timestamps,
});
