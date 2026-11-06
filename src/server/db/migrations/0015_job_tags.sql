ALTER TABLE "jobs" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "jobs_tags_index" ON "jobs" USING gin ("tags");