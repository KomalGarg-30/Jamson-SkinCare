ALTER TABLE "product_images" RENAME COLUMN "alt" TO "alt_text";
ALTER TABLE "product_images" ALTER COLUMN "alt_text" SET DEFAULT '';
ALTER TABLE "product_images" ADD COLUMN "file_id" text;
ALTER TABLE "product_images" ADD COLUMN "is_main" boolean DEFAULT false NOT NULL;
ALTER TABLE "product_images" DROP COLUMN "updated_at";

WITH ranked_images AS (
  SELECT "id", row_number() OVER (PARTITION BY "product_id" ORDER BY "position", "created_at", "id") AS image_rank
  FROM "product_images"
)
UPDATE "product_images" SET "is_main" = true
WHERE "id" IN (SELECT "id" FROM ranked_images WHERE image_rank = 1);

DROP INDEX "product_images_product_idx";
CREATE INDEX "product_images_product_position_idx" ON "product_images" USING btree ("product_id", "position");
CREATE UNIQUE INDEX "product_images_file_id_unique_idx" ON "product_images" USING btree ("file_id") WHERE "file_id" IS NOT NULL;
CREATE UNIQUE INDEX "product_images_one_main_per_product_idx" ON "product_images" USING btree ("product_id") WHERE "is_main";