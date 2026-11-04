import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/* ------------------------------------------------------------------ */
/* shared columns                                                      */
/* ------------------------------------------------------------------ */

const id = () => uuid().primaryKey().defaultRandom()
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

/* ------------------------------------------------------------------ */
/* enums                                                               */
/* ------------------------------------------------------------------ */

export const factKind = pgEnum("fact_kind", [
  "identity",
  "experience",
  "education",
  "project",
  "skill",
  "certification",
  "language",
  "achievement",
  "other",
])
export const factStatus = pgEnum("fact_status", ["verified", "needs_review", "archived"])
export const applicationStatus = pgEnum("application_status", [
  "draft",
  "parsed",
  "analyzed",
  "generated",
  "ready",
  "submitted",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
])
export const coverLetterDecision = pgEnum("cover_letter_decision", [
  "required",
  "optional",
  "not_requested",
  "not_mentioned",
])
export const documentKind = pgEnum("document_kind", ["cv", "cover_letter"])
export const revisionOrigin = pgEnum("revision_origin", [
  "manual",
  "generate",
  "enhance",
  "fix",
  "repair",
  "translate",
  "restore",
])
export const revisionVerdict = pgEnum("revision_verdict", ["kept", "discarded", "rejected"])
export const runStatus = pgEnum("run_status", ["queued", "running", "succeeded", "failed", "cancelled"])

/* ------------------------------------------------------------------ */
/* profile: the grounded source of truth                               */
/* ------------------------------------------------------------------ */

export const profiles = pgTable("profiles", {
  id: id(),
  fullName: text().notNull(),
  headline: text().notNull().default(""),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  location: text().notNull().default(""),
  links: jsonb().$type<{ label: string; url: string }[]>().notNull().default([]),
  defaultLanguage: text().notNull().default("en"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/**
 * One verifiable statement about the candidate. Generated text must cite fact
 * ids; numbers in generated text must appear in a cited fact.
 */
export const facts = pgTable(
  "facts",
  {
    id: id(),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: factKind().notNull(),
    status: factStatus().notNull().default("needs_review"),
    title: text().notNull(),
    organization: text().notNull().default(""),
    startDate: text(),
    endDate: text(),
    /** The canonical claim, in the profile's default language. */
    statement: text().notNull(),
    /** Approved phrasings per language: { fr: [...], en: [...] } */
    variants: jsonb().$type<Record<string, string[]>>().notNull().default({}),
    evidence: text().notNull().default(""),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    /** Things that must never be claimed around this fact (NDA, overstatement). */
    doNotClaim: text().array().notNull().default(sql`'{}'::text[]`),
    confidential: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.profileId, t.kind), index().on(t.status)],
)

/* ------------------------------------------------------------------ */
/* companies + jobs                                                    */
/* ------------------------------------------------------------------ */

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text().notNull(),
    slug: text().notNull(),
    /** Verified company website — never the job board host. */
    website: text(),
    websiteSource: text(),
    logoPath: text(),
    logoSource: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.slug)],
)

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    sourceUrl: text(),
    canonicalUrl: text(),
    board: text().notNull().default("manual"),
    externalId: text(),
    title: text().notNull(),
    location: text().notNull().default(""),
    remote: text().notNull().default(""),
    employmentType: text().notNull().default(""),
    salary: text().notNull().default(""),
    language: text().notNull().default("en"),
    postedAt: timestamp({ withTimezone: true }),
    /** Original text, stored unchanged. Untrusted input. */
    rawText: text().notNull(),
    parseConfidence: real().notNull().default(0),
    parseWarnings: text().array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.canonicalUrl), index().on(t.companyId)],
)

/* ------------------------------------------------------------------ */
/* applications + documents + immutable revisions                      */
/* ------------------------------------------------------------------ */

export const applications = pgTable(
  "applications",
  {
    id: id(),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    status: applicationStatus().notNull().default("draft"),
    language: text().notNull().default("en"),
    coverLetter: coverLetterDecision().notNull().default("not_mentioned"),
    /** Structured analysis output (requirements, keywords, fit, selected fact ids). */
    analysis: jsonb().$type<Record<string, unknown>>(),
    selectedFactIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    notes: text().notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.status), index().on(t.profileId)],
)

export const documents = pgTable(
  "documents",
  {
    id: id(),
    applicationId: uuid()
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: documentKind().notNull(),
    language: text().notNull(),
    /** Pointer to the kept revision. Undo = move this pointer. */
    currentRevisionId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.applicationId, t.kind, t.language)],
)

export type QualitySummary = {
  score: number
  errors: number
  warnings: number
  pages: number
  checks: { id: string; status: "pass" | "warn" | "fail"; detail: string }[]
}

export const revisions = pgTable(
  "revisions",
  {
    id: id(),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    parentId: uuid(),
    origin: revisionOrigin().notNull(),
    verdict: revisionVerdict().notNull().default("kept"),
    verdictReason: text().notNull().default(""),
    latex: text().notNull(),
    citedFactIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    pdfPath: text(),
    quality: jsonb().$type<QualitySummary>(),
    runId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.documentId, t.createdAt)],
)

/* ------------------------------------------------------------------ */
/* observability: every workflow run and step is traced                */
/* ------------------------------------------------------------------ */

export const runs = pgTable(
  "runs",
  {
    id: id(),
    workflow: text().notNull(),
    applicationId: uuid().references(() => applications.id, { onDelete: "cascade" }),
    status: runStatus().notNull().default("queued"),
    /** Same input → same key → no duplicate work. */
    idempotencyKey: text().notNull(),
    input: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb().$type<Record<string, unknown>>(),
    error: text(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.idempotencyKey), index().on(t.applicationId, t.createdAt)],
)

export const runSteps = pgTable(
  "run_steps",
  {
    id: id(),
    runId: uuid()
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    name: text().notNull(),
    status: runStatus().notNull().default("running"),
    model: text(),
    promptVersion: text(),
    inputTokens: integer(),
    outputTokens: integer(),
    costUsd: real(),
    latencyMs: integer(),
    detail: text().notNull().default(""),
    output: jsonb().$type<Record<string, unknown>>(),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.runId, t.createdAt)],
)
