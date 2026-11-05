ALTER TABLE "ca_links" ADD COLUMN "invitation_code_hash" text;--> statement-breakpoint
-- Pre-fix links have no invitation proof; end them without attributing an action to a user.
UPDATE "ca_links" SET "status" = 'ended', "ended_at" = now(), "ended_by" = NULL WHERE "status" IN ('pending', 'accepted');--> statement-breakpoint
ALTER TABLE "ca_links" ADD CONSTRAINT "ca_links_invitation_check" CHECK ("ca_links"."status" = 'ended' OR "ca_links"."invitation_code_hash" IS NOT NULL);
