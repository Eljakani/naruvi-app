ALTER TABLE "entries" ADD COLUMN "translations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "phrasings" ADD COLUMN "auto_text" text;--> statement-breakpoint
ALTER TABLE "phrasings" ADD COLUMN "auto_source" text;