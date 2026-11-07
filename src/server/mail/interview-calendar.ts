import "server-only"
import { and, eq } from "drizzle-orm"
import { calendar } from "@/lib/ical"
import { interviewCalendarInput, type InterviewCalendarInput } from "@/lib/interview-calendar"
import { db } from "@/server/db/client"
import { applications, companies, jobs, mailMessages, settings } from "@/server/db/schema"

const key = (messageId: string) => `calendar.interview.${messageId}`
export const storedInterview = interviewCalendarInput.extend({ company: interviewCalendarInput.shape.location, title: interviewCalendarInput.shape.location, updatedAt: interviewCalendarInput.shape.start })

export async function getInterviewCalendar(applicationId: string, messageId: string) {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key(messageId)) })
  const parsed = storedInterview.safeParse(row?.value)
  return parsed.success && parsed.data.applicationId === applicationId ? parsed.data : null
}

export async function saveInterviewCalendar(raw: InterviewCalendarInput) {
  const input = interviewCalendarInput.parse(raw)
  const start = new Date(input.start)
  if (start.getTime() < Date.now() - 60_000) throw new Error("Choose a future interview time.")
  return db.transaction(async (tx) => {
    const [source] = await tx.select({ company: companies.name, title: jobs.title }).from(mailMessages)
      .innerJoin(applications, eq(applications.id, mailMessages.applicationId)).innerJoin(jobs, eq(jobs.id, applications.jobId)).leftJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(eq(mailMessages.id, input.messageId), eq(applications.id, input.applicationId), eq(mailMessages.direction, "out")))
    if (!source) throw new Error("The sent email is no longer available on this application.")
    const value = { ...input, company: source.company ?? "", title: source.title, updatedAt: new Date().toISOString() }
    await tx.insert(settings).values({ key: key(input.messageId), value }).onConflictDoUpdate({ target: settings.key, set: { value } })
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: input.timeZone, hour: "2-digit", minute: "2-digit" }).format(start)
    await tx.update(applications).set({ nextStep: `${input.tentative ? "Tentative interview" : "Interview"} · ${time} ${input.timeZone}`.slice(0, 200), nextStepDue: start }).where(eq(applications.id, input.applicationId))
    return value
  })
}

export function interviewEvent(value: NonNullable<Awaited<ReturnType<typeof getInterviewCalendar>>>, origin: string) {
  return {
    uid: `interview-${value.messageId}@naruvi`, date: new Date(value.start), end: new Date(Date.parse(value.start) + value.duration * 60_000),
    status: value.tentative ? "TENTATIVE" as const : "CONFIRMED" as const, location: value.location,
    summary: `${value.tentative ? "Tentative interview" : "Interview"} · ${value.company || value.title}`,
    description: `${value.title}\nTime zone: ${value.timeZone}${value.tentative ? "\nPersonal hold; awaiting confirmation from the recruiter." : ""}\n${origin}/applications/${value.applicationId}`,
    url: `${origin}/applications/${value.applicationId}`, updatedAt: new Date(value.updatedAt),
  }
}

export function interviewCalendarFile(value: NonNullable<Awaited<ReturnType<typeof getInterviewCalendar>>>, origin: string) {
  return calendar("Naruvi interviews", [interviewEvent(value, origin)])
}
