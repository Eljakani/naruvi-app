CREATE TABLE "job_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"board" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"job_id" uuid,
	"found_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_leads" ADD CONSTRAINT "job_leads_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_leads_url_index" ON "job_leads" USING btree ("url");--> statement-breakpoint
CREATE INDEX "job_leads_state_found_at_index" ON "job_leads" USING btree ("state","found_at");