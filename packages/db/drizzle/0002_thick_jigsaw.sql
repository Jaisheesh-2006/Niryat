ALTER TABLE "agent_actions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_actions" ALTER COLUMN "paypal_action" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_actions" ALTER COLUMN "payload" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_actions" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "client_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "fy" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "amount" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "description" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "paypal_txn_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "gross" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "seq" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "sac" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recurrence" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_token" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paypal_invoice_id_unique" UNIQUE("paypal_invoice_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paypal_recurring_series_id_unique" UNIQUE("paypal_recurring_series_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_token_unique" UNIQUE("pdf_token");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fy_seq_unique" UNIQUE("user_id","fy","seq");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_number_unique" UNIQUE("user_id","number");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_paypal_txn_id_unique" UNIQUE("paypal_txn_id");