import "server-only"
import { and, eq, gte, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm"
import { db } from "@/server/db/client"
import { applicationEvents, applications, jobLeads, mailMessages } from "@/server/db/schema"

/** Small numbers for the sidebar: what's waiting on the Dashboard and on Jobs. */
export async function navCounts() {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const count = sql<number>`count(*)`.mapWith(Number)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000)
  const [[replies], [due], [leads], week] = await Promise.all([
    db.select({ n: sql<number>`count(distinct ${mailMessages.applicationId})`.mapWith(Number) }).from(mailMessages).innerJoin(applications, eq(applications.id, mailMessages.applicationId)).where(and(eq(mailMessages.suggestionState, "pending"), isNull(applications.archivedAt))),
    db.select({ n: count }).from(applications).where(and(isNotNull(applications.nextStepDue), lt(applications.nextStepDue, end), isNull(applications.archivedAt), notInArray(applications.status, ["rejected", "withdrawn"]))),
    db.select({ n: count }).from(jobLeads).where(eq(jobLeads.state, "new")),
    // Applications that reached a stage in the last 7 days and are still there (or further), so it matches the dashboard.
    db.select({ status: applicationEvents.toStatus, current: applications.status, id: applicationEvents.applicationId }).from(applicationEvents).innerJoin(applications, eq(applications.id, applicationEvents.applicationId)).where(and(gte(applicationEvents.createdAt, weekAgo), isNull(applications.archivedAt))),
  ])
  const STILL: Record<string, string[]> = { submitted: ["submitted", "interviewing", "offer", "rejected"], interviewing: ["interviewing", "offer"], offer: ["offer"], analyzed: ["analyzed", "generated", "ready", "submitted", "interviewing", "offer"] }
  const reached = (status: string) => new Set(week.filter((row) => row.status === status && STILL[status].includes(row.current)).map((row) => row.id)).size
  return { "/": (replies?.n ?? 0) + (due?.n ?? 0), "/jobs": leads?.n ?? 0, "week.sent": reached("submitted"), "week.interviews": reached("interviewing"), "week.offers": reached("offer"), "week.checked": reached("analyzed") } as Record<string, number>
}
