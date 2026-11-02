CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_positive" CHECK ("cart_items"."quantity" BETWEEN 1 AND 20);--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_type_valid" CHECK ("coupons"."type" IN ('percentage', 'fixed'));--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_value_positive" CHECK ("coupons"."value" > 0);--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_usage_nonnegative" CHECK ("coupons"."used_count" >= 0 AND ("coupons"."max_uses" IS NULL OR "coupons"."used_count" <= "coupons"."max_uses"));--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_price_nonnegative" CHECK ("order_items"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_nonnegative" CHECK ("orders"."subtotal" >= 0 AND "orders"."shipping" >= 0 AND "orders"."tax" >= 0 AND "orders"."discount" >= 0 AND "orders"."total" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_positive" CHECK ("products"."price" > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_discount_price_valid" CHECK ("products"."discount_price" IS NULL OR ("products"."discount_price" > 0 AND "products"."discount_price" < "products"."price"));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_nonnegative" CHECK ("products"."stock" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_rating_range" CHECK ("products"."rating" BETWEEN 0 AND 500);--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5);