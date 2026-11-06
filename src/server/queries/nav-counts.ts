import "server-only"
import { and, eq, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm"
import { db } from "@/server/db/client"
import { applications, jobLeads, mailMessages } from "@/server/db/schema"

/** Small numbers for the sidebar: what's waiting on the Dashboard and on Jobs. */
export async function navCounts() {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const count = sql<number>`count(*)`.mapWith(Number)
  const [[replies], [due], [leads]] = await Promise.all([
    db.select({ n: sql<number>`count(distinct ${mailMessages.applicationId})`.mapWith(Number) }).from(mailMessages).innerJoin(applications, eq(applications.id, mailMessages.applicationId)).where(and(eq(mailMessages.suggestionState, "pending"), isNull(applications.archivedAt))),
    db.select({ n: count }).from(applications).where(and(isNotNull(applications.nextStepDue), lt(applications.nextStepDue, end), isNull(applications.archivedAt), notInArray(applications.status, ["rejected", "withdrawn"]))),
    db.select({ n: count }).from(jobLeads).where(eq(jobLeads.state, "new")),
  ])
  return { "/": (replies?.n ?? 0) + (due?.n ?? 0), "/jobs": leads?.n ?? 0 } as Record<string, number>
}
