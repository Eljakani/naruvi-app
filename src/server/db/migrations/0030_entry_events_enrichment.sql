ALTER TYPE "public"."entry_kind" ADD VALUE 'event' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "enrichment" jsonb;