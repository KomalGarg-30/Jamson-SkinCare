CREATE TYPE "public"."email_otp_purpose" AS ENUM('signup', 'password_reset');--> statement-breakpoint
CREATE TABLE "email_otps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"purpose" "email_otp_purpose" NOT NULL,
	"otp_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"resend_window_start" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = COALESCE("created_at", now()) WHERE "email_verified" = true AND "email_verified_at" IS NULL;--> statement-breakpoint
UPDATE "password_reset_tokens" SET "used_at" = COALESCE("used_at", now()), "updated_at" = now() WHERE "used_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "email_otps_email_purpose_idx" ON "email_otps" USING btree ("email","purpose");--> statement-breakpoint
CREATE INDEX "email_otps_expires_at_idx" ON "email_otps" USING btree ("expires_at");