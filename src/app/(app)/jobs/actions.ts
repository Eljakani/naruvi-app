"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { findDuplicates, setJobTags } from "@/server/companies/repository"
import { dismissLead, markLeadImported } from "@/server/jobs/leads"
import { previewJob, saveJob } from "@/server/jobs/ingest"
import { trackJob } from "@/server/applications/repository"
import { cleanTags } from "@/lib/similar"
import { refreshJobInsights } from "@/server/jobs/insights"
import { scheduleResearch } from "@/server/research/auto"
import type { JobDraft } from "@/server/jobs/schema"

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const input = z
  .object({ url: z.string().trim().url("Enter a full link (https://…)").or(z.literal("")).default(""), text: z.string().max(120_000).default("") })
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
  if (!z.string().uuid().safeParse(jobId).success) return { ok: false, error: "Invalid job." }
  const insights = await refreshJobInsights(jobId)
  revalidatePath(`/jobs/${jobId}`)
  return insights ? { ok: true, data: null } : { ok: false, error: "Couldn’t analyze this posting. See Runs for details." }
}

export async function setJobTagsAction(jobId: string, tags: string[]): Promise<ActionResult<string[]>> {
  const parsed = z.object({ jobId: z.string().uuid(), tags: z.array(z.string().max(100)).max(50) }).safeParse({ jobId, tags })
  if (!parsed.success) return { ok: false, error: "Invalid tags." }
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
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid lead." }
  await dismissLead(id)
  revalidatePath("/jobs")
  return { ok: true, data: null }
}

/** Move a posting from Discover into Applications, at "Saved". */
export async function trackJobAction(jobId: string): Promise<ActionResult<{ applicationId: string }>> {
  if (!z.string().uuid().safeParse(jobId).success) return { ok: false, error: "Invalid job." }
  const applicationId = await trackJob(jobId)
  if (!applicationId) return { ok: false, error: "Create your profile first, then track jobs." }
  revalidatePath("/jobs")
  revalidatePath("/applications")
  revalidatePath("/")
  return { ok: true, data: { applicationId } }
}
