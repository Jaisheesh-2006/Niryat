ALTER TABLE "disputes" ALTER COLUMN "paypal_dispute_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ALTER COLUMN "reason" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_documents" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_documents" ALTER COLUMN "month" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_documents" ALTER COLUMN "file_url" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_documents" ALTER COLUMN "parsed_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_lines" ALTER COLUMN "fira_document_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_lines" ALTER COLUMN "date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_lines" ALTER COLUMN "amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_lines" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_lines" ALTER COLUMN "reference" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "confidence" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'open';--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "source_rule_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD COLUMN "payment_id" uuid;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "currency" text NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "capture_id" text;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "response_due_date" date;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "paypal_updated_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "fira_documents" ADD COLUMN "sha256" text NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_documents" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "fira_lines" ADD COLUMN "position" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_lines" ADD COLUMN "source_text" text NOT NULL;--> statement-breakpoint
ALTER TABLE "fira_lines" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "capture_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "message" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "dedupe_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_paypal_dispute_id_unique" UNIQUE("paypal_dispute_id");--> statement-breakpoint
ALTER TABLE "fira_documents" ADD CONSTRAINT "fira_documents_user_id_sha256_unique" UNIQUE("user_id","sha256");--> statement-breakpoint
ALTER TABLE "fira_lines" ADD CONSTRAINT "fira_lines_fira_document_id_position_unique" UNIQUE("fira_document_id","position");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_fira_line_id_unique" UNIQUE("fira_line_id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_payment_id_unique" UNIQUE("payment_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_dedupe_key_unique" UNIQUE("dedupe_key");