CREATE TYPE "public"."agent_session_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_verdict" AS ENUM('beli', 'tahan', 'jual', 'abstain');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('healthy', 'degraded', 'dead');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('running', 'success', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."market" AS ENUM('crypto', 'idx', 'us');--> statement-breakpoint
CREATE TABLE "agent_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"agent" varchar(32) NOT NULL,
	"content" text NOT NULL,
	"provider_id" varchar(32),
	"model" varchar(64),
	"key_index" integer,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_key" varchar(128) NOT NULL,
	"instrument_id" integer,
	"market" "market" NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"status" "agent_session_status" DEFAULT 'running' NOT NULL,
	"verdict" "agent_verdict",
	"confidence" integer,
	"rationale" text,
	"facts_snapshot" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "candle_daily" (
	"instrument_id" integer NOT NULL,
	"date" date NOT NULL,
	"open" numeric(20, 8) NOT NULL,
	"high" numeric(20, 8) NOT NULL,
	"low" numeric(20, 8) NOT NULL,
	"close" numeric(20, 8) NOT NULL,
	"volume" numeric(28, 8) NOT NULL,
	"adj_close" numeric(20, 8),
	"source_id" varchar(32) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candle_daily_instrument_id_date_pk" PRIMARY KEY("instrument_id","date")
);
--> statement-breakpoint
CREATE TABLE "data_source_health" (
	"source_id" varchar(32) PRIMARY KEY NOT NULL,
	"status" "health_status" DEFAULT 'healthy' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_success_at" timestamp with time zone,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_quarantine" (
	"id" serial PRIMARY KEY NOT NULL,
	"instrument_id" integer,
	"source_id" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instrument" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"market" "market" NOT NULL,
	"currency" varchar(8) NOT NULL,
	"sector" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"listed_at" date,
	"delisted_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" varchar(64) NOT NULL,
	"batch_key" varchar(128) NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cursor" jsonb,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "job_schedule" (
	"job_name" varchar(64) PRIMARY KEY NOT NULL,
	"hours_of_day" jsonb NOT NULL,
	"timezone" varchar(48) DEFAULT 'UTC' NOT NULL,
	"trading_days_only" boolean DEFAULT false NOT NULL,
	"market" "market",
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "symbol_alias" (
	"instrument_id" integer NOT NULL,
	"source_id" varchar(32) NOT NULL,
	"alias" varchar(64) NOT NULL,
	CONSTRAINT "symbol_alias_instrument_id_source_id_pk" PRIMARY KEY("instrument_id","source_id")
);
--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_session_id_agent_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candle_daily" ADD CONSTRAINT "candle_daily_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_quarantine" ADD CONSTRAINT "ingest_quarantine_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_alias" ADD CONSTRAINT "symbol_alias_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_message_session_seq_uq" ON "agent_message" USING btree ("session_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_key_uq" ON "agent_session" USING btree ("session_key");--> statement-breakpoint
CREATE INDEX "agent_session_symbol_idx" ON "agent_session" USING btree ("market","symbol","started_at");--> statement-breakpoint
CREATE INDEX "candle_daily_date_idx" ON "candle_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "ingest_quarantine_created_idx" ON "ingest_quarantine" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_market_symbol_uq" ON "instrument" USING btree ("market","symbol");--> statement-breakpoint
CREATE INDEX "instrument_market_idx" ON "instrument" USING btree ("market");--> statement-breakpoint
CREATE UNIQUE INDEX "job_run_job_batch_uq" ON "job_run" USING btree ("job_name","batch_key");--> statement-breakpoint
CREATE INDEX "job_run_job_started_idx" ON "job_run" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "symbol_alias_source_alias_uq" ON "symbol_alias" USING btree ("source_id","alias");