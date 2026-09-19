CREATE TYPE "public"."asset_class" AS ENUM('crypto', 'saham', 'emas', 'komoditi', 'indeks');--> statement-breakpoint
ALTER TYPE "public"."market" ADD VALUE 'global';--> statement-breakpoint
ALTER TABLE "instrument" ADD COLUMN "asset_class" "asset_class" DEFAULT 'crypto' NOT NULL;--> statement-breakpoint
ALTER TABLE "instrument" ADD COLUMN "region" varchar(48);--> statement-breakpoint
CREATE INDEX "instrument_asset_class_idx" ON "instrument" USING btree ("asset_class");