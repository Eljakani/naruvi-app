ALTER TABLE "companies" ADD COLUMN "careers" jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "careers_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "goal_verdict" text;