"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { headers } from "next/headers"
import { analyzeJob } from "@/server/applications/repository"
import { scheduleResearch } from "@/server/research/auto"
import { archiveMany, moveApplication, setArchived, setNextStep } from "@/server/tracking/service"
import { serverError } from "@/i18n/server-errors"

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
