CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "sync_runs_status_check" CHECK ("sync_runs"."status" IN ('running', 'ok', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sync_runs_one_running" ON "sync_runs" USING btree ("status") WHERE "sync_runs"."status" = 'running';