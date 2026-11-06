"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { analyzeJob } from "@/server/applications/repository"
import { scheduleResearch } from "@/server/research/auto"
import { archiveMany, moveApplication, setArchived, setNextStep } from "@/server/tracking/service"

/** Form action: analyze a job against the profile, then open the application. */
export async function analyzeJobAction(formData: FormData) {
  const jobId = z.string().uuid().parse(formData.get("jobId"))
  const application = await analyzeJob(jobId)
  scheduleResearch(jobId)
  revalidatePath("/applications")
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/")
  redirect(`/applications/${application.id}`)
}

const statusSchema = z.enum(["draft", "parsed", "analyzed", "generated", "ready", "submitted", "interviewing", "offer", "rejected", "withdrawn"])

/** Board move or "Move to" menu: set the status by hand and record it. */
export async function moveApplicationAction(id: string, status: string, note = ""): Promise<{ ok: boolean; message?: string }> {
  const parsed = z.object({ id: z.string().uuid(), status: statusSchema, note: z.string().max(500) }).safeParse({ id, status, note })
  if (!parsed.success) return { ok: false, message: "Invalid move." }
  try {
    await moveApplication(parsed.data.id, parsed.data.status, parsed.data.note)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn’t move the application." }
  }
  revalidatePath("/applications")
  revalidatePath(`/applications/${parsed.data.id}`)
  revalidatePath("/")
  return { ok: true }
}

function refresh(id: string) {
  revalidatePath("/applications")
  revalidatePath(`/applications/${id}`)
  revalidatePath("/")
}

export async function archiveApplicationAction(id: string, archived: boolean): Promise<{ ok: boolean; message?: string }> {
  const parsed = z.object({ id: z.string().uuid(), archived: z.boolean() }).safeParse({ id, archived })
  if (!parsed.success) return { ok: false, message: "Invalid request." }
  try {
    await setArchived(parsed.data.id, parsed.data.archived)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn’t update the application." }
  }
  refresh(parsed.data.id)
  return { ok: true }
}

export async function setNextStepAction(id: string, nextStep: string, due: string | null): Promise<{ ok: boolean; message?: string }> {
  const parsed = z.object({ id: z.string().uuid(), nextStep: z.string().max(200), due: z.string().datetime({ offset: true }).nullable() }).safeParse({ id, nextStep, due })
  if (!parsed.success) return { ok: false, message: "Invalid next step." }
  try {
    await setNextStep(parsed.data.id, parsed.data.nextStep, parsed.data.due ? new Date(parsed.data.due) : null)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn’t save the next step." }
  }
  refresh(parsed.data.id)
  return { ok: true }
}

export async function archiveManyAction(ids: string[]): Promise<{ ok: boolean; message?: string }> {
  const parsed = z.array(z.string().uuid()).max(500).safeParse(ids)
  if (!parsed.success) return { ok: false, message: "Invalid request." }
  await archiveMany(parsed.data)
  revalidatePath("/applications")
  revalidatePath("/")
  return { ok: true }
}

export async function acceptMailSuggestionAction(messageId: string): Promise<{ ok: boolean; message?: string }> {
  if (!z.string().uuid().safeParse(messageId).success) return { ok: false, message: "Invalid email." }
  try {
    const { acceptSuggestion } = await import("@/server/mail/classify")
    refresh(await acceptSuggestion(messageId))
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn’t apply the suggestion." }
  }
}

export async function dismissMailSuggestionAction(messageId: string): Promise<{ ok: boolean; message?: string }> {
  if (!z.string().uuid().safeParse(messageId).success) return { ok: false, message: "Invalid email." }
  const { dismissSuggestion } = await import("@/server/mail/classify")
  const applicationId = await dismissSuggestion(messageId)
  if (applicationId) refresh(applicationId)
  return { ok: true }
}
