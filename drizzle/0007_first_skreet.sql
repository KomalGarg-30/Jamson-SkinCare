ALTER TYPE "public"."order_status" ADD VALUE 'pending_payment' BEFORE 'confirmed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'payment_review';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'created' BEFORE 'pending';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'authorized' BEFORE 'paid';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'captured' BEFORE 'paid';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'collected' BEFORE 'failed';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'expired' BEFORE 'refunded';--> statement-breakpoint
CREATE TABLE "payment_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid,
	"order_id" uuid,
	"actor_user_id" uuid,
	"action" varchar(80) NOT NULL,
	"amount" integer,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"payment_id" uuid,
	"kind" varchar(60) NOT NULL,
	"details" jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"return_id" uuid,
	"razorpay_refund_id" varchar(120),
	"amount" integer NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"speed" varchar(20),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reserved_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "idempotency_key" varchar(160);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_payment_method" varchar(40);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "reserved_stock" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "status" varchar(30) DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "payments" SET "user_id" = "orders"."user_id" FROM "orders" WHERE "orders"."id" = "payments"."order_id";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_discrepancies" ADD CONSTRAINT "payment_discrepancies_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_discrepancies" ADD CONSTRAINT "payment_discrepancies_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_discrepancies" ADD CONSTRAINT "payment_discrepancies_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_audit_logs_payment_idx" ON "payment_audit_logs" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_discrepancies_status_idx" ON "payment_discrepancies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_discrepancies_order_idx" ON "payment_discrepancies" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_razorpay_id_idx" ON "refunds" USING btree ("razorpay_refund_id") WHERE "refunds"."razorpay_refund_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_return_unique_idx" ON "refunds" USING btree ("return_id") WHERE "refunds"."return_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_user_idempotency_idx" ON "orders" USING btree ("user_id","idempotency_key") WHERE "orders"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_provider_payment_idx" ON "payments" USING btree ("provider_payment_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_reserved_stock_nonnegative" CHECK ("products"."reserved_stock" >= 0);