CREATE TABLE "ca_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"freelancer_user_id" uuid NOT NULL,
	"ca_email" text NOT NULL,
	"ca_user_id" uuid,
	"status" text NOT NULL,
	"ended_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "ca_links_status_check" CHECK ("ca_links"."status" IN ('pending', 'accepted', 'ended')),
	CONSTRAINT "ca_links_ended_by_check" CHECK ("ca_links"."ended_by" IN ('freelancer', 'ca'))
);
--> statement-breakpoint
ALTER TABLE "ca_links" ADD CONSTRAINT "ca_links_freelancer_user_id_users_id_fk" FOREIGN KEY ("freelancer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ca_links" ADD CONSTRAINT "ca_links_ca_user_id_users_id_fk" FOREIGN KEY ("ca_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ca_links_one_active" ON "ca_links" USING btree ("freelancer_user_id") WHERE "ca_links"."status" IN ('pending', 'accepted');