CREATE TABLE IF NOT EXISTS "click_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"visitor_hash" varchar(32) NOT NULL,
	"path" varchar(255) NOT NULL,
	"label" varchar(80),
	"href" varchar(255),
	"tag" varchar(16),
	"x_pct" double precision NOT NULL,
	"y_pct" double precision NOT NULL,
	"device_class" varchar(16) DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committee_chat_thread" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"topic" varchar(32) DEFAULT 'saham' NOT NULL,
	"symbol" varchar(32),
	"market" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "committee_chat_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"content" text NOT NULL,
	"meta" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "donation_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"title" varchar(120) NOT NULL,
	"message" text NOT NULL,
	"methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "premium_order" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_ref" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"plan_id" varchar(40) NOT NULL,
	"plan_label" varchar(60) NOT NULL,
	"days" integer NOT NULL,
	"amount" integer NOT NULL,
	"method" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'UNPAID' NOT NULL,
	"tripay_reference" varchar(64),
	"checkout_url" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "premium_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"title" varchar(120) NOT NULL,
	"message" text NOT NULL,
	"benefits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "premium_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "visit_log" ADD COLUMN IF NOT EXISTS "browser" varchar(32);--> statement-breakpoint
ALTER TABLE "visit_log" ADD COLUMN IF NOT EXISTS "os" varchar(32);--> statement-breakpoint
ALTER TABLE "visit_log" ADD COLUMN IF NOT EXISTS "referrer" varchar(128);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "committee_chat_message" ADD CONSTRAINT "committee_chat_message_thread_id_committee_chat_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."committee_chat_thread"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "committee_chat_thread" ADD CONSTRAINT "committee_chat_thread_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "premium_order" ADD CONSTRAINT "premium_order_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_log_created_at_idx" ON "click_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "click_log_path_idx" ON "click_log" USING btree ("path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "committee_chat_message_thread_idx" ON "committee_chat_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "committee_chat_thread_user_idx" ON "committee_chat_thread" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "premium_order_ref_uq" ON "premium_order" USING btree ("merchant_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "premium_order_user_idx" ON "premium_order" USING btree ("user_id","created_at");