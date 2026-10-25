CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"paypal_action" text,
	"payload" jsonb,
	"status" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text,
	"address" text,
	"country" text,
	"email" text,
	"export_check_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid,
	"paypal_dispute_id" text,
	"amount" numeric,
	"status" text,
	"reason" text,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "fira_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"month" date,
	"file_url" text,
	"parsed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fira_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fira_document_id" uuid,
	"date" date,
	"amount" numeric,
	"currency" text,
	"reference" text,
	"purpose_code" text
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"client_id" uuid,
	"type" text,
	"number" text,
	"fy" text,
	"date" date,
	"currency" text,
	"amount" numeric,
	"description" text,
	"paypal_invoice_id" text,
	"paypal_recurring_series_id" text,
	"pdf_url" text,
	"status" text
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"fira_line_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"confidence" numeric,
	"confirmed_by_user" boolean,
	CONSTRAINT "matches_fira_line_id_payment_id_pk" PRIMARY KEY("fira_line_id","payment_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid,
	"paypal_txn_id" text,
	"kind" text,
	"gross" numeric,
	"fee" numeric,
	"net" numeric,
	"currency" text,
	"fx_rate" numeric,
	"received_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"gst_registered" boolean,
	"gstin" text,
	"lut_number" text,
	"lut_valid_from" date,
	"lut_valid_to" date,
	"work_type" text,
	"purpose_code" text,
	"pan_last4" text
);
--> statement-breakpoint
CREATE TABLE "rule_versions" (
	"rule_id" text NOT NULL,
	"version" integer NOT NULL,
	"effective_from" date,
	"source" text,
	"review" text DEFAULT 'unchecked' NOT NULL,
	CONSTRAINT "rule_versions_rule_id_version_pk" PRIMARY KEY("rule_id","version")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" text,
	"due_date" date,
	"status" text,
	"source_rule_id" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"paypal_payer_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fira_documents" ADD CONSTRAINT "fira_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fira_lines" ADD CONSTRAINT "fira_lines_fira_document_id_fira_documents_id_fk" FOREIGN KEY ("fira_document_id") REFERENCES "public"."fira_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_fira_line_id_fira_lines_id_fk" FOREIGN KEY ("fira_line_id") REFERENCES "public"."fira_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;