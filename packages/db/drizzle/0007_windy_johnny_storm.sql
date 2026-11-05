ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'freelancer' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('freelancer', 'ca'));