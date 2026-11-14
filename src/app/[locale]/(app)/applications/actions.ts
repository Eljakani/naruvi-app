"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { analyzeJob, applicationForJob, fitCheckState, type FitPhase } from "@/server/applications/repository"
import { db } from "@/server/db/client"
import { applications } from "@/server/db/schema"
import { scheduleResearch } from "@/server/research/auto"
import { archiveMany, moveApplication, setArchived, setNextStep } from "@/server/tracking/service"
import { serverError } from "@/i18n/server-errors"

/** Form action (board cards): analyze a job, then open the application. A failed check is shown there, not as an error page. */
export async function analyzeJobAction(formData: FormData) {
  const jobId = z.string().uuid().parse(formData.get("jobId"))
  const result = await checkFitAction(jobId)
  redirect(result.applicationId ? `/applications/${result.applicationId}` : `/jobs/${jobId}`)
}

/**
 * Check the fit of a job against the profile (creates the application if
 * needed). Never throws: `error` is a sentence for the person, empty when the
 * run trace is the only useful detail.
 */
export async function checkFitAction(jobId: string): Promise<{ ok: boolean; applicationId: string | null; error?: string }> {
  if (!z.string().uuid().safeParse(jobId).success) return { ok: false, applicationId: null, error: await serverError("invalidJob") }
  const existing = await applicationForJob(jobId)
  // A check already under way (the automatic one, another tab): let it finish instead of running twice.
  if (existing && (await fitCheckState(jobId)).state === "running") return { ok: true, applicationId: existing.id }
  try {
    const application = await analyzeJob(jobId)
    scheduleResearch(jobId)
    return { ok: true, applicationId: application.id }
  } catch {
    const state = await fitCheckState(jobId).catch(() => null)
    return { ok: false, applicationId: existing?.id ?? null, error: state?.state === "failed" && state.error ? state.error : await serverError("fitCheckFailed") }
  } finally {
    revalidatePath("/applications")
    revalidatePath(`/jobs/${jobId}`)
    revalidatePath("/")
  }
}

/** What the application page is still waiting for: polled while a fit check or the job's insights are pending. */
export async function applicationSyncAction(applicationId: string): Promise<{ fit: "idle" | "running" | "failed" | "done"; phase: FitPhase | null; insights: boolean } | null> {
  if (!z.string().uuid().safeParse(applicationId).success) return null
  const application = await db.query.applications.findFirst({ columns: { jobId: true }, where: eq(applications.id, applicationId), with: { job: { columns: { insights: true } } } })
  if (!application) return null
  const state = await fitCheckState(application.jobId)
  return { fit: state.state, phase: state.state === "running" ? state.phase : null, insights: Boolean(application.job.insights) }
}

const statusSchema = z.enum(["draft", "parsed", "analyzed", "generated", "ready", "submitted", "interviewing", "offer", "rejected", "withdrawn"])

/** Board move or "Move to" menu: set the status by hand and record it. */
export async function moveApplicationAction(id: string, status: string, note = ""): Promise<{ ok: boolean; message?: string }> {
  const parsed = z.object({ id: z.string().uuid(), status: statusSchema, note: z.string().max(500) }).safeParse({ id, status, note })
  if (!parsed.success) return { ok: false, message: await serverError("invalidMove") }
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
  if (!parsed.success) return { ok: false, message: await serverError("invalidRequest") }
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
  if (!parsed.success) return { ok: false, message: await serverError("invalidNextStep") }
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
  if (!parsed.success) return { ok: false, message: await serverError("invalidRequest") }
  await archiveMany(parsed.data)
  revalidatePath("/applications")
  revalidatePath("/")
  return { ok: true }
}

export async function acceptMailSuggestionAction(messageId: string): Promise<{ ok: boolean; message?: string }> {
  if (!z.string().uuid().safeParse(messageId).success) return { ok: false, message: await serverError("invalidEmail") }
  try {
    const { acceptSuggestion } = await import("@/server/mail/classify")
    refresh(await acceptSuggestion(messageId))
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn’t apply the suggestion." }
  }
}

export async function dismissMailSuggestionAction(messageId: string): Promise<{ ok: boolean; message?: string }> {
  if (!z.string().uuid().safeParse(messageId).success) return { ok: false, message: await serverError("invalidEmail") }
  const { dismissSuggestion } = await import("@/server/mail/classify")
  const applicationId = await dismissSuggestion(messageId)
  if (applicationId) refresh(applicationId)
  return { ok: true }
}

export async function composeContextAction(applicationId: string, kind: "apply" | "follow_up" | "thank_you" | "reply", replyToId?: string | null) {
  if (!z.string().uuid().safeParse(applicationId).success || !["apply", "follow_up", "thank_you", "reply"].includes(kind)) return null
  const { composeContext } = await import("@/server/mail/send")
  if (replyToId && !z.string().uuid().safeParse(replyToId).success) return null
  return composeContext(applicationId, kind, replyToId)
}

export async function draftMailAction(input: import("@/lib/mail-draft").DraftMailInput) {
  try {
    const { draftApplicationMail } = await import("@/server/mail/send")
    return { ok: true as const, draft: await draftApplicationMail(input) }
  } catch (error) {
    return { ok: false as const, message: error instanceof z.ZodError ? (error.issues[0]?.message ?? "Check the drafting options.") : error instanceof Error ? error.message : "Couldn’t draft the email. Your message is unchanged." }
  }
}

export async function getInterviewCalendarAction(applicationId: string, messageId: string) {
  if (!z.string().uuid().safeParse(applicationId).success || !z.string().uuid().safeParse(messageId).success) return null
  const { getInterviewCalendar } = await import("@/server/mail/interview-calendar")
  return getInterviewCalendar(applicationId, messageId)
}

export async function saveInterviewCalendarAction(input: import("@/lib/interview-calendar").InterviewCalendarInput) {
  try {
    const { saveInterviewCalendar, interviewCalendarFile } = await import("@/server/mail/interview-calendar")
    const event = await saveInterviewCalendar(input)
    refresh(input.applicationId)
    return { ok: true as const, event, ics: interviewCalendarFile(event, (await headers()).get("origin") ?? "") }
  } catch (error) {
    return { ok: false as const, message: error instanceof z.ZodError ? (error.issues[0]?.message ?? "Check the interview details.") : error instanceof Error ? error.message : "Couldn’t save the interview." }
  }
}

export async function downloadInterviewCalendarAction(applicationId: string, messageId: string) {
  try {
    const event = await getInterviewCalendarAction(applicationId, messageId)
    if (!event) return { ok: false as const, message: await serverError("interviewNotFound") }
    const { interviewCalendarFile } = await import("@/server/mail/interview-calendar")
    return { ok: true as const, ics: interviewCalendarFile(event, (await headers()).get("origin") ?? "") }
  } catch { return { ok: false as const, message: await serverError("couldntDownloadTheInterview") } }
}

export async function sendMailAction(input: { applicationId: string; kind: "apply" | "follow_up" | "thank_you" | "reply"; to: string; cc: string; subject: string; body: string; attachCv: boolean; attachLetter: boolean; replyTo: string | null }): Promise<{ ok: boolean; message?: string; sentMessageId?: string; interviewRelated?: boolean }> {
  try {
    const { sendApplicationMail } = await import("@/server/mail/send")
    const sent = await sendApplicationMail(input)
    refresh(input.applicationId)
    return { ok: true, ...sent }
  } catch (error) {
    return { ok: false, message: error instanceof z.ZodError ? (error.issues[0]?.message ?? "Check the form.") : error instanceof Error ? error.message : "Couldn’t send the email." }
  }
}
