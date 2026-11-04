import { relations, sql } from "drizzle-orm"
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

export const entryKind = pgEnum("entry_kind", [
  "experience",
  "education",
  "project",
  "skill",
  "certification",
  "language",
  "achievement",
  "other",
])
export const entryStatus = pgEnum("entry_status", ["verified", "needs_review", "archived"])
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
  /** Short professional title per language, shown under the name: { en, fr }. */
  headlines: jsonb().$type<Record<string, string>>().notNull().default({}),
  /** Profile photo in the asset store (photos/<sha>.<ext>). */
  photoPath: text(),
  email: text().notNull().default(""),
  phone: text().notNull().default(""),
  location: text().notNull().default(""),
  links: jsonb().$type<{ label: string; url: string }[]>().notNull().default([]),
  availability: text().notNull().default(""),
  /** Contact fields that must never be changed by generation. */
  locked: text().array().notNull().default(sql`'{}'::text[]`),
  defaultLanguage: text().notNull().default("en"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export type EntryDisplay = {
  role?: string
  organization?: string
  dates?: string
  location?: string
  label?: string
}

/**
 * A profile record: one job, degree, project, skill cluster, certification…
 * It owns the facts (citable truths) and the approved phrasings.
 */
export const entries = pgTable(
  "entries",
  {
    id: id(),
    profileId: uuid()
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** Stable human key, e.g. exp-acme-2024. Used by importers to upsert. */
    key: text().notNull(),
    kind: entryKind().notNull(),
    status: entryStatus().notNull().default("needs_review"),
    title: text().notNull(),
    /** Display fields per language: { en: {...}, fr: {...} } */
    display: jsonb().$type<Record<string, EntryDisplay>>().notNull().default({}),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    skills: text().array().notNull().default(sql`'{}'::text[]`),
    evidence: text().array().notNull().default(sql`'{}'::text[]`),
    /** Never claim these (NDA limits, overstatements). Sent to every prompt. */
    doNotClaim: text().array().notNull().default(sql`'{}'::text[]`),
    /** Logo shown next to the entry (path inside the asset store, e.g. logos/<sha>.png). */
    logoPath: text(),
    /** NDA-sensitive: generation must stay high-level. */
    confidential: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    source: text().notNull().default("manual"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.profileId, t.key), index().on(t.profileId, t.kind)],
)

/** One atomic, verifiable truth. The unit that generated text must cite. */
export const facts = pgTable(
  "facts",
  {
    id: id(),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    statement: text().notNull(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.entryId)],
)

/**
 * Approved wording for a CV bullet in one language, linked to the facts that
 * support it. A phrasing with a number no supporting fact contains is flagged.
 */
export const phrasings = pgTable(
  "phrasings",
  {
    id: id(),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    group: text().notNull().default("General"),
    /** bullet = a claim (must be grounded); label = a heading/cluster name. */
    role: text().$type<"bullet" | "label">().notNull().default("bullet"),
    language: text().notNull(),
    text: text().notNull(),
    factIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.entryId, t.language)],
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
  checks: { id: string; status: "pass" | "warn" | "fail"; label: string; detail: string }[]
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
    /** Structured document (see src/server/documents/model.ts). */
    content: jsonb().$type<Record<string, unknown>>(),
    /** Legacy/optional export; documents are structured data first. */
    latex: text(),
    pages: integer(),
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

/* ------------------------------------------------------------------ */
/* relations (for db.query with joins)                                 */
/* ------------------------------------------------------------------ */

export const jobsRelations = relations(jobs, ({ one }) => ({
  company: one(companies, { fields: [jobs.companyId], references: [companies.id] }),
}))

export const companiesRelations = relations(companies, ({ many }) => ({
  jobs: many(jobs),
}))

export const applicationsRelations = relations(applications, ({ one }) => ({
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
}))
