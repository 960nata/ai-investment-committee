CREATE TABLE "feature_daily" (
	"instrument_id" integer NOT NULL,
	"date" date NOT NULL,
	"feature_set_version" varchar(32) NOT NULL,
	"values" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_daily_instrument_id_date_feature_set_version_pk" PRIMARY KEY("instrument_id","date","feature_set_version")
);
--> statement-breakpoint
ALTER TABLE "feature_daily" ADD CONSTRAINT "feature_daily_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_daily_version_date_idx" ON "feature_daily" USING btree ("feature_set_version","date");