CREATE TABLE "macro_series" (
	"series_id" varchar(64) NOT NULL,
	"date" date NOT NULL,
	"value" double precision NOT NULL,
	"source" varchar(24) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "macro_series_series_id_date_pk" PRIMARY KEY("series_id","date")
);
--> statement-breakpoint
CREATE TABLE "ownership_monthly" (
	"instrument_id" integer NOT NULL,
	"as_of" date NOT NULL,
	"available_at" date NOT NULL,
	"shares_listed" bigint NOT NULL,
	"price" numeric(18, 4),
	"local" bigint[] NOT NULL,
	"foreign" bigint[] NOT NULL,
	"local_total" bigint NOT NULL,
	"foreign_total" bigint NOT NULL,
	"source_id" varchar(32) DEFAULT 'ksei' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ownership_monthly_instrument_id_as_of_pk" PRIMARY KEY("instrument_id","as_of")
);
--> statement-breakpoint
CREATE TABLE "reconciliation_flag" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" integer NOT NULL,
	"period" varchar(12) NOT NULL,
	"item" varchar(48) NOT NULL,
	"source_a" varchar(32) NOT NULL,
	"value_a" double precision NOT NULL,
	"source_b" varchar(32) NOT NULL,
	"value_b" double precision NOT NULL,
	"rel_diff" double precision NOT NULL,
	"severity" varchar(16) NOT NULL,
	"chosen_source" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "fundamental_quarterly" ADD COLUMN "unit_scale" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "fundamental_quarterly" ADD COLUMN "fiscal_year_end_month" smallint;--> statement-breakpoint
ALTER TABLE "ownership_monthly" ADD CONSTRAINT "ownership_monthly_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_flag" ADD CONSTRAINT "reconciliation_flag_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ownership_available_idx" ON "ownership_monthly" USING btree ("instrument_id","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_uq" ON "reconciliation_flag" USING btree ("instrument_id","period","item","source_a","source_b");--> statement-breakpoint
CREATE INDEX "reconciliation_open_idx" ON "reconciliation_flag" USING btree ("severity","resolved_at");