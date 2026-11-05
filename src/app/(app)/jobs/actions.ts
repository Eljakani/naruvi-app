"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { previewJob, saveJob } from "@/server/jobs/ingest"
import { refreshJobInsights } from "@/server/jobs/insights"
import type { JobDraft } from "@/server/jobs/schema"

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const input = z
  .object({ url: z.string().trim().url("Enter a full link (https://…)").or(z.literal("")).default(""), text: z.string().max(120_000).default("") })
  .refine((value) => value.url || value.text.trim().length >= 80, "Paste a job link, or at least a few lines of the job description.")

export async function previewJobAction(raw: { url?: string; text?: string }): Promise<ActionResult<Awaited<ReturnType<typeof previewJob>>>> {
  try {
    const parsed = input.parse(raw)
    return { ok: true, data: await previewJob(parsed) }
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Invalid input." }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function saveJobAction(draft: JobDraft): Promise<ActionResult<{ id: string }>> {
  try {
    const job = await saveJob(draft)
    await refreshJobInsights(job.id)
    revalidatePath("/jobs")
    revalidatePath("/")
    return { ok: true, data: { id: job.id } }
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
