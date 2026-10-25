ALTER TABLE "clients" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "country" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "expected_turnover_inr" integer;