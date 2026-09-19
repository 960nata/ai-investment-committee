CREATE TYPE "public"."confidence" AS ENUM('tinggi', 'sedang', 'rendah', 'tidak memadai');--> statement-breakpoint
CREATE TYPE "public"."horizon" AS ENUM('pendek', 'menengah', 'panjang');--> statement-breakpoint
CREATE TABLE "score_daily" (
	"instrument_id" integer NOT NULL,
	"date" date NOT NULL,
	"horizon" "horizon" NOT NULL,
	"model_version" varchar(32) NOT NULL,
	"feature_set_version" varchar(32) NOT NULL,
	"score" numeric(6, 3) NOT NULL,
	"probability" numeric(5, 4),
	"confidence" "confidence" NOT NULL,
	"confidence_score" numeric(5, 4) NOT NULL,
	"missing_weight" numeric(5, 4) NOT NULL,
	"drivers" jsonb NOT NULL,
	"groups" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "score_daily_instrument_id_date_horizon_model_version_pk" PRIMARY KEY("instrument_id","date","horizon","model_version")
);
--> statement-breakpoint
ALTER TABLE "score_daily" ADD CONSTRAINT "score_daily_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "score_daily_date_horizon_idx" ON "score_daily" USING btree ("date","horizon");