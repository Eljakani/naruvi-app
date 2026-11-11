"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { findDuplicates, setJobTags } from "@/server/companies/repository"
import { dismissLead, getLead, markLeadImported } from "@/server/jobs/leads"
import { discoveredKeywords, leadParts } from "@/lib/discover"
import { apifyStatus, discoverJobs, removeApify, saveApify } from "@/server/jobs/discover"
import { companyBrandingFromLink, previewJob, saveJob } from "@/server/jobs/ingest"
import { normalizeWebsite } from "@/lib/company-input"
import { trackJob } from "@/server/applications/repository"
import { cleanTags } from "@/lib/similar"
import { refreshJobInsights } from "@/server/jobs/insights"
import { scheduleResearch } from "@/server/research/auto"
import type { JobDraft } from "@/server/jobs/schema"
import { serverError } from "@/i18n/server-errors"

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const input = z
  .object({ url: z.string().trim().url("Enter a full link (https://…)").regex(/^https?:\/\//i).or(z.literal("")).default(""), text: z.string().max(120_000).default("") })
  .refine((value) => value.url || value.text.trim().length >= 80, "Paste a job link, or at least a few lines of the job description.")

export type Duplicate = Awaited<ReturnType<typeof findDuplicates>>[number]

export async function previewJobAction(raw: { url?: string; text?: string }): Promise<ActionResult<{ draft: Awaited<ReturnType<typeof previewJob>>; duplicates: Duplicate[] }>> {
  try {
    const parsed = input.parse(raw)
    const draft = await previewJob(parsed)
    // A failed duplicate check must never block an import.
    const duplicates = await findDuplicates(draft).catch(() => [])
    return { ok: true, data: { draft, duplicates } }
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Invalid input." }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function saveJobAction(draft: JobDraft): Promise<ActionResult<{ id: string; applicationId: string | null }>> {
  try {
    const job = await saveJob(draft)
    await markLeadImported(job.id, [draft.sourceUrl, draft.canonicalUrl])
    await refreshJobInsights(job.id)
    const applicationId = await trackJob(job.id)
    scheduleResearch(job.id)
    revalidatePath("/jobs")
    revalidatePath("/applications")
    revalidatePath("/")
    return { ok: true, data: { id: job.id, applicationId } }
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ") }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function refreshJobInsightsAction(jobId: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(jobId).success) return { ok: false, error: await serverError("invalidJob") }
  const insights = await refreshJobInsights(jobId)
  revalidatePath(`/jobs/${jobId}`)
  return insights ? { ok: true, data: null } : { ok: false, error: await serverError("couldntAnalyzeThisPosting") }
}

export async function setJobTagsAction(jobId: string, tags: string[]): Promise<ActionResult<string[]>> {
  const parsed = z.object({ jobId: z.string().uuid(), tags: z.array(z.string().max(100)).max(50) }).safeParse({ jobId, tags })
  if (!parsed.success) return { ok: false, error: await serverError("invalidTags") }
  const clean = cleanTags(parsed.data.tags)
  try {
    await setJobTags(parsed.data.jobId, clean)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn’t save the tags." }
  }
  revalidatePath(`/jobs/${parsed.data.jobId}`)
  revalidatePath("/jobs")
  return { ok: true, data: clean }
}

export async function dismissLeadAction(id: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: await serverError("invalidLead") }
  await dismissLead(id)
  revalidatePath("/jobs")
  return { ok: true, data: null }
}

/** Move a posting from Jobs into Applications, at "Saved". */
export async function trackJobAction(jobId: string): Promise<ActionResult<{ applicationId: string }>> {
  if (!z.string().uuid().safeParse(jobId).success) return { ok: false, error: await serverError("invalidJob") }
  const applicationId = await trackJob(jobId)
  if (!applicationId) return { ok: false, error: await serverError("createYourProfileFirst") }
  revalidatePath("/jobs")
  revalidatePath("/applications")
  revalidatePath("/")
  return { ok: true, data: { applicationId } }
}

const failed = (error: unknown) => ({ ok: false as const, message: error instanceof z.ZodError ? (error.issues[0]?.message ?? "Check the form.") : error instanceof Error ? error.message : String(error) })

/** `null` removes the token and the discovery settings. */
export async function saveApifyAction(value: { token: string; boards: string[]; daily: boolean } | null): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await (value ? saveApify(value) : removeApify())
    revalidatePath("/integrations")
    revalidatePath("/jobs")
    return { ok: true }
  } catch (error) {
    return failed(error)
  }
}

/** Search the job boards from the profile; new postings land in the job leads. `setup`: no Apify token yet. */
export async function discoverJobsAction(): Promise<{ ok: true; found: number; added: number; failed: number } | { ok: false; setup: boolean; message: string }> {
  try {
    if (!(await apifyStatus()).configured) return { ok: false, setup: true, message: "" }
    const result = await discoverJobs()
    revalidatePath("/jobs")
    return { ok: true, ...result }
  } catch (error) {
    return { ...failed(error), setup: false }
  }
}

/** A lead's full posting text, for its details dialog. */
export async function leadDetailsAction(id: string): Promise<{ ok: true; facts: string[]; body: string } | { ok: false; message: string }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: await serverError("invalidLead") }
  const lead = await getLead(id)
  if (!lead) return { ok: false, message: await serverError("invalidLead") }
  return { ok: true, ...leadParts(lead.text ?? "", Boolean(discoveredKeywords(lead.source))) }
}

/** The logo on a company website you just typed, for the job you're reviewing. Nothing is saved but the (content-addressed) image. */
export async function siteLogoAction(website: string): Promise<{ ok: true; logoPath: string | null } | { ok: false }> {
  const url = normalizeWebsite(z.string().max(500).parse(website))
  if (!url) return { ok: false }
  const branding = await companyBrandingFromLink(url).catch(() => null)
  return { ok: true, logoPath: branding?.logo?.path ?? null }
}
