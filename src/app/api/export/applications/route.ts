import { eq, sql } from "drizzle-orm"
import { connection } from "next/server"
import { toCsv } from "@/lib/csv"
import { STATUS_LABEL } from "@/lib/stages"
import { displayFitScore } from "@/server/analysis/match"
import { listApplications, type StoredAnalysis } from "@/server/applications/repository"
import { db } from "@/server/db/client"
import { applicationEvents, mailMessages } from "@/server/db/schema"

/** Every application as a spreadsheet (CSV). Same access as the app itself: it runs on this computer. */
export async function GET() {
  await connection()
  const [rows, sent, mail] = await Promise.all([
    listApplications({ archived: "all" }),
    db.select({ id: applicationEvents.applicationId, at: sql<Date>`min(${applicationEvents.createdAt})`.mapWith((value) => new Date(value)) }).from(applicationEvents).where(eq(applicationEvents.toStatus, "submitted")).groupBy(applicationEvents.applicationId),
    db.select({ id: mailMessages.applicationId, n: sql<number>`count(*)`.mapWith(Number) }).from(mailMessages).groupBy(mailMessages.applicationId),
  ])
  const sentAt = new Map(sent.map((row) => [row.id, row.at]))
  const emails = new Map(mail.map((row) => [row.id, row.n]))
  const header = ["Company", "Role", "Location", "Stage", "Fit", "Applied on", "Next step", "Next step due", "Emails", "Tags", "Archived", "Added", "Last update", "Job posting", "Company website"]
  const body = rows.map((row) => [
    row.job.company?.name ?? "",
    row.job.title,
    row.job.location,
    STATUS_LABEL[row.status],
    displayFitScore(row.analysis as StoredAnalysis | null),
    sentAt.get(row.id) ?? null,
    row.nextStep,
    row.nextStepDue,
    emails.get(row.id) ?? 0,
    row.job.tags.join(", "),
    row.archivedAt ? "yes" : "",
    row.createdAt,
    row.updatedAt,
    row.job.sourceUrl ?? "",
    row.job.company?.website ?? "",
  ])
  const date = new Date().toISOString().slice(0, 10)
  return new Response(toCsv(header, body), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="naruvi-applications-${date}.csv"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  })
}
