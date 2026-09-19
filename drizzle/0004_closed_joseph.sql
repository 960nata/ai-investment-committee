CREATE TYPE "public"."period_type" AS ENUM('kuartal', 'tahunan');--> statement-breakpoint
CREATE TABLE "fundamental_quarterly" (
	"instrument_id" integer NOT NULL,
	"period" varchar(12) NOT NULL,
	"source_accession" varchar(40) NOT NULL,
	"period_type" "period_type" NOT NULL,
	"period_end" date NOT NULL,
	"reported_at" date NOT NULL,
	"fiscal_year" integer NOT NULL,
	"fiscal_period" varchar(4) NOT NULL,
	"currency" varchar(8) NOT NULL,
	"items" jsonb NOT NULL,
	"missing_items" jsonb NOT NULL,
	"completeness" numeric(5, 4) NOT NULL,
	"source_id" varchar(32) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fundamental_quarterly_instrument_id_period_source_accession_pk" PRIMARY KEY("instrument_id","period","source_accession")
);
--> statement-breakpoint
ALTER TABLE "fundamental_quarterly" ADD CONSTRAINT "fundamental_quarterly_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fundamental_reported_idx" ON "fundamental_quarterly" USING btree ("instrument_id","reported_at");