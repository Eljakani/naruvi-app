import { z } from "zod"

/** Parser output, validated at the boundary with the vendored JS parser. */
export const parsedJob = z.object({
  company: z.string().default(""),
  role: z.string().default(""),
  companyUrl: z.string().default(""),
  companyLogo: z.string().default(""),
  companyLinks: z.array(z.string()).default([]),
  location: z.string().default(""),
  salary: z.string().default(""),
  remote: z.string().default(""),
  employmentType: z.string().default(""),
  postedAt: z.string().default(""),
  jobId: z.string().default(""),
  board: z.string().default("generic"),
  source: z.string().default("html"),
  language: z.string().default("en"),
  applyUrl: z.string().default(""),
  description: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0),
  warnings: z.array(z.string()).default([]),
})
export type ParsedJob = z.infer<typeof parsedJob>

/** What the user reviews (and may edit) before saving. */
export const jobDraft = z.object({
  sourceUrl: z.string().url().or(z.literal("")).default(""),
  canonicalUrl: z.string().default(""),
  board: z.string().default("manual"),
  externalId: z.string().default(""),
  company: z.string().trim().min(1, "Company is required.").max(160),
  companyWebsite: z.string().url().or(z.literal("")).default(""),
  companyWebsiteSource: z.string().default(""),
  logoPath: z
    .string()
    .regex(/^logos\/[a-f0-9]{24}\.(png|jpg|gif|webp|svg|ico)$/)
    .nullable()
    .default(null),
  logoSource: z.string().default(""),
  title: z.string().trim().min(2, "Role is required.").max(200),
  location: z.string().max(200).default(""),
  remote: z.string().max(60).default(""),
  employmentType: z.string().max(80).default(""),
  salary: z.string().max(120).default(""),
  language: z.string().regex(/^[a-z]{2}$/).default("en"),
  postedAt: z.string().default(""),
  rawText: z.string().trim().min(80, "The job description is too short; paste the full text.").max(120_000),
  parseConfidence: z.number().min(0).max(1).default(0),
  warnings: z.array(z.string()).default([]),
})
export type JobDraft = z.infer<typeof jobDraft>
