CREATE TYPE "public"."application_status" AS ENUM('draft', 'parsed', 'analyzed', 'generated', 'ready', 'submitted', 'interviewing', 'offer', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."cover_letter_decision" AS ENUM('required', 'optional', 'not_requested', 'not_mentioned');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('cv', 'cover_letter');--> statement-breakpoint
CREATE TYPE "public"."fact_kind" AS ENUM('identity', 'experience', 'education', 'project', 'skill', 'certification', 'language', 'achievement', 'other');--> statement-breakpoint
CREATE TYPE "public"."fact_status" AS ENUM('verified', 'needs_review', 'archived');--> statement-breakpoint
CREATE TYPE "public"."revision_origin" AS ENUM('manual', 'generate', 'enhance', 'fix', 'repair', 'translate', 'restore');--> statement-breakpoint
CREATE TYPE "public"."revision_verdict" AS ENUM('kept', 'discarded', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"cover_letter" "cover_letter_decision" DEFAULT 'not_mentioned' NOT NULL,
	"analysis" jsonb,
	"selected_fact_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text,
	"website_source" text,
	"logo_path" text,
	"logo_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"language" text NOT NULL,
	"current_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"kind" "fact_kind" NOT NULL,
	"status" "fact_status" DEFAULT 'needs_review' NOT NULL,
	"title" text NOT NULL,
	"organization" text DEFAULT '' NOT NULL,
	"start_date" text,
	"end_date" text,
	"statement" text NOT NULL,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"do_not_claim" text[] DEFAULT '{}'::text[] NOT NULL,
	"confidential" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"source_url" text,
	"canonical_url" text,
	"board" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"title" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"remote" text DEFAULT '' NOT NULL,
	"employment_type" text DEFAULT '' NOT NULL,
	"salary" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"posted_at" timestamp with time zone,
	"raw_text" text NOT NULL,
	"parse_confidence" real DEFAULT 0 NOT NULL,
	"parse_warnings" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"parent_id" uuid,
	"origin" "revision_origin" NOT NULL,
	"verdict" "revision_verdict" DEFAULT 'kept' NOT NULL,
	"verdict_reason" text DEFAULT '' NOT NULL,
	"latex" text NOT NULL,
	"cited_fact_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"pdf_path" text,
	"quality" jsonb,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"model" text,
	"prompt_version" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" real,
	"latency_ms" integer,
	"detail" text DEFAULT '' NOT NULL,
	"output" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow" text NOT NULL,
	"application_id" uuid,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_steps" ADD CONSTRAINT "run_steps_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_status_index" ON "applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "applications_profile_id_index" ON "applications" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_slug_index" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_application_id_kind_language_index" ON "documents" USING btree ("application_id","kind","language");--> statement-breakpoint
CREATE INDEX "facts_profile_id_kind_index" ON "facts" USING btree ("profile_id","kind");--> statement-breakpoint
CREATE INDEX "facts_status_index" ON "facts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_canonical_url_index" ON "jobs" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "jobs_company_id_index" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "revisions_document_id_created_at_index" ON "revisions" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "run_steps_run_id_created_at_index" ON "run_steps" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_idempotency_key_index" ON "runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "runs_application_id_created_at_index" ON "runs" USING btree ("application_id","created_at");