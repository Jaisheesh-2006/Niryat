CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"trigger" text NOT NULL,
	"month" text NOT NULL,
	"as_of" date NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"summary" jsonb,
	"ai_status" text,
	"ai_cost_usd" numeric DEFAULT '0' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"actor" text NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_tool_calls_run_id_seq_unique" UNIQUE("run_id","seq")
);
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_calls" ADD CONSTRAINT "agent_tool_calls_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_one_running" ON "agent_runs" USING btree ("user_id","kind") WHERE "agent_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_dedupe_key_unique" UNIQUE("dedupe_key");