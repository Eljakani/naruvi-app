ALTER TABLE "job_leads" ADD COLUMN "company" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "location" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Careers-page leads stored "Role · Location" as the title: split it, and take the employer from the watched company.
UPDATE "job_leads" SET
  "company" = substring("source" from '^New on (.+)’s careers page$'),
  "location" = CASE WHEN position(' · ' in "title") > 0 THEN regexp_replace("title", '^.* · ', '') ELSE '' END,
  "title" = CASE WHEN position(' · ' in "title") > 0 THEN regexp_replace("title", ' · [^·]*$', '') ELSE "title" END
WHERE "source" ~ '^New on .+’s careers page$' AND "company" = '';
--> statement-breakpoint
UPDATE "job_leads" AS l SET "logo_path" = c."logo_path"
FROM "companies" AS c
WHERE l."company" <> '' AND l."logo_path" IS NULL AND c."name" = l."company" AND c."logo_path" IS NOT NULL;
