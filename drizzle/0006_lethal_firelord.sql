CREATE TABLE "backtest_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model_version" varchar(32) NOT NULL,
	"feature_set_version" varchar(32) NOT NULL,
	"market" "market",
	"config" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"trials" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "backtest_run_at_idx" ON "backtest_run" USING btree ("run_at");