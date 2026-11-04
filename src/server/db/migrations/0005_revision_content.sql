ALTER TABLE "revisions" ALTER COLUMN "latex" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "content" jsonb;--> statement-breakpoint
ALTER TABLE "revisions" ADD COLUMN "pages" integer;