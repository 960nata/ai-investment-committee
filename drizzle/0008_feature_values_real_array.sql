CREATE TABLE IF NOT EXISTS "ad_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_name" varchar(64) NOT NULL,
	"title" varchar(128) NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"ad_code_html" text,
	"target_url" text,
	"image_url" text,
	"sponsor_name" varchar(128),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_user" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(128) NOT NULL,
	"name" varchar(128) DEFAULT 'Analis Komite' NOT NULL,
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"password_hash" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_key_set" (
	"feature_set_version" varchar(32) PRIMARY KEY NOT NULL,
	"keys" text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_news" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(180) NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text NOT NULL,
	"category" varchar(48) DEFAULT 'ekonomi-makro' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mentioned_symbols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" varchar(16) DEFAULT 'neutral' NOT NULL,
	"impact_score" integer DEFAULT 5 NOT NULL,
	"featured_image" jsonb,
	"youtube_video" jsonb,
	"key_takeaways" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_markdown" text NOT NULL,
	"author" varchar(64) DEFAULT 'AI Intelligence Desk' NOT NULL,
	"reading_time_minutes" integer DEFAULT 3 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"visitor_hash" varchar(32) NOT NULL,
	"path" varchar(255) NOT NULL,
	"country" varchar(4),
	"region" varchar(64),
	"city" varchar(128),
	"latitude" double precision,
	"longitude" double precision,
	"device_class" varchar(16) DEFAULT 'unknown' NOT NULL,
	"geo_source" varchar(16) DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- feature_daily.values: jsonb -> real[].
-- Di basis data produksi perubahan ini sudah dikerjakan TANPA kehilangan data
-- lewat scripts/migrate-feature-storage.ts (cadangkan -> ubah -> isi kembali ->
-- verifikasi). Blok di bawah hanya bertindak pada tabel yang masih jsonb dan
-- KOSONG; tabel jsonb yang berisi ditolak, supaya migrasi ini tidak pernah
-- diam-diam mengosongkan riwayat fitur di lingkungan mana pun.
DO $$
BEGIN
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_name = 'feature_daily' AND column_name = 'values') = 'jsonb' THEN
    IF EXISTS (SELECT 1 FROM feature_daily LIMIT 1) THEN
      RAISE EXCEPTION 'feature_daily berisi data jsonb: jalankan scripts/migrate-feature-storage.ts, bukan migrasi ini';
    END IF;
    ALTER TABLE "feature_daily" ALTER COLUMN "values" SET DATA TYPE real[] USING NULL;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ad_settings_slot_name_uq" ON "ad_settings" USING btree ("slot_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "app_user_email_uq" ON "app_user" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_user_role_idx" ON "app_user" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "market_news_slug_uq" ON "market_news" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_news_category_idx" ON "market_news" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_news_published_at_idx" ON "market_news" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visit_log_created_at_idx" ON "visit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visit_log_visitor_idx" ON "visit_log" USING btree ("visitor_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visit_log_country_idx" ON "visit_log" USING btree ("country");