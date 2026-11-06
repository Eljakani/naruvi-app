ALTER TABLE "applications" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "next_step" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "next_step_due" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "applications_archived_at_index" ON "applications" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "applications_next_step_due_index" ON "applications" USING btree ("next_step_due");