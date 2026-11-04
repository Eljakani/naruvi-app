ALTER TABLE "profiles" ADD COLUMN "headlines" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "photo_path" text;
--> statement-breakpoint
UPDATE "profiles" SET "headlines" = jsonb_build_object('en', "headline") WHERE "headline" <> '';
