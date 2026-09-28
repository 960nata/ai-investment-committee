-- Ditulis ulang agar idempoten. Sebagian tabel di sini (market_news_translation,
-- kolom app_user) sudah dibuat lebih dulu oleh DDL lazy di lib/db/*-queries.ts,
-- dan migrasi yang gagal pada "already exists" akan menghentikan db:setup.
CREATE TABLE IF NOT EXISTS "announcement" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text NOT NULL,
	"tone" varchar(16) DEFAULT 'info' NOT NULL,
	"link_url" text,
	"link_label" varchar(64),
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_dismissal" (
	"user_id" integer NOT NULL,
	"announcement_id" integer NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_dismissal_user_id_announcement_id_pk" PRIMARY KEY("user_id","announcement_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_news_translation" (
	"news_id" integer NOT NULL,
	"locale" varchar(8) NOT NULL,
	"title" varchar(255) NOT NULL,
	"summary" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_takeaways" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_markdown" text NOT NULL,
	"image_alt" text,
	"image_caption" text,
	"model" varchar(96),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_news_translation_news_id_locale_pk" PRIMARY KEY("news_id","locale")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_position" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"quantity" numeric(24, 8) NOT NULL,
	"avg_price" numeric(24, 8) NOT NULL,
	"opened_at" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_alert" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"kind" varchar(24) NOT NULL,
	"threshold" numeric(24, 8),
	"horizon" "horizon",
	"last_verdict" varchar(16),
	"is_active" boolean DEFAULT true NOT NULL,
	"triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notification" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"link_url" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_item" (
	"user_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_item_user_id_instrument_id_pk" PRIMARY KEY("user_id","instrument_id")
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "avatar_url" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "country" varchar(4);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_dismissal" ADD CONSTRAINT "announcement_dismissal_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "announcement_dismissal" ADD CONSTRAINT "announcement_dismissal_announcement_id_announcement_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcement"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_news_translation" ADD CONSTRAINT "market_news_translation_news_id_market_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."market_news"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_position" ADD CONSTRAINT "portfolio_position_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_position" ADD CONSTRAINT "portfolio_position_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_alert" ADD CONSTRAINT "price_alert_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_alert" ADD CONSTRAINT "price_alert_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_notification" ADD CONSTRAINT "user_notification_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_item" ADD CONSTRAINT "watchlist_item_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_item" ADD CONSTRAINT "watchlist_item_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcement_active_idx" ON "announcement" USING btree ("is_active","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_position_user_idx" ON "portfolio_position" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_alert_user_idx" ON "price_alert" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_alert_active_idx" ON "price_alert" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_notification_user_idx" ON "user_notification" USING btree ("user_id","created_at");