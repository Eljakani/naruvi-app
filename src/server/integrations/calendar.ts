import "server-only"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { and, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm"
import { calendar } from "@/lib/ical"
import { db } from "@/server/db/client"
import { applications, companies, jobs, settings } from "@/server/db/schema"

import { interviewEvent, storedInterview } from "@/server/mail/interview-calendar"

const KEY = "integration.calendar"

/** The feed is private: a long random token in the URL, which can be reset at any time. */
export async function calendarToken(): Promise<string | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, KEY) })
  const token = (row?.value as { token?: string } | undefined)?.token
  return typeof token === "string" && /^[a-f0-9]{48}$/.test(token) ? token : null
}

export async function newCalendarToken() {
  const token = randomBytes(24).toString("hex")
  await db.insert(settings).values({ key: KEY, value: { token } }).onConflictDoUpdate({ target: settings.key, set: { value: { token } } })
  return token
}

export async function disableCalendar() {
  await db.delete(settings).where(eq(settings.key, KEY))
}

export async function checkCalendarToken(candidate: string) {
  const token = await calendarToken()
  if (!token || candidate.length !== token.length) return false
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(token))
}

const ACTIVE_DATED = and(isNotNull(applications.nextStepDue), isNull(applications.archivedAt), notInArray(applications.status, ["rejected", "withdrawn"]))

export async function datedNextSteps() {
  return db.$count(applications, ACTIVE_DATED)
}

/** Dated reminders plus timed interviews on active applications, without duplicating an interview's next step. */
export async function calendarFeed(origin: string) {
  const rows = await db
    .select({ id: applications.id, nextStep: applications.nextStep, due: applications.nextStepDue, updatedAt: applications.updatedAt, title: jobs.title, company: companies.name, status: applications.status })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(ACTIVE_DATED)
  const interviewRows = await db.select({ value: settings.value }).from(settings).where(sql`${settings.key} like 'calendar.interview.%'`)
  const active = await db.select({ id: applications.id }).from(applications).where(and(isNull(applications.archivedAt), notInArray(applications.status, ["rejected", "withdrawn"])))
  const activeIds = new Set(active.map((application) => application.id))
  const interviews = interviewRows.flatMap((row) => { const parsed = storedInterview.safeParse(row.value); return parsed.success && activeIds.has(parsed.data.applicationId) ? [parsed.data] : [] })
  return calendar(
    "Naruvi: job search",
    [...rows.filter((row) => !interviews.some((event) => event.applicationId === row.id && Date.parse(event.start) === row.due!.getTime())).map((row) => ({
      uid: `${row.id}@naruvi`,
      date: row.due!,
      summary: `${row.nextStep || "Next step"} · ${row.company ?? row.title}`,
      description: `${row.title}${row.company ? ` at ${row.company}` : ""}\n${origin}/applications/${row.id}`,
      url: `${origin}/applications/${row.id}`,
      updatedAt: row.updatedAt,
    })), ...interviews.map((event) => interviewEvent(event, origin))],
  )
}
