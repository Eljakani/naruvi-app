import "server-only"
import { count, desc, eq, sql } from "drizzle-orm"
import { connection } from "next/server"
import { db } from "@/server/db/client"
import { CLOSED, daysUntil, needsAttention } from "@/lib/attention"
import { listApplications, type StoredAnalysis } from "@/server/applications/repository"
import { displayFitScore } from "@/server/analysis/match"
import { stageSince } from "@/server/tracking/service"
import { mailInbox } from "@/server/mail/classify"
import { applications, entries, facts, jobs, profiles, runs } from "@/server/db/schema"

export async function getDashboard() {
  await connection()
  const latest = db.select().from(runs).orderBy(desc(runs.createdAt), desc(runs.id)).limit(6).as("latest_runs")
  const [[jobCount], [factCount], [profileCount], recentRuns, active, since, inbox] = await Promise.all([
    db.select({ n: count() }).from(jobs),
    db.select({ n: count() }).from(facts).innerJoin(entries, eq(facts.entryId, entries.id)).where(eq(entries.status, "verified")),
    db.select({ n: count(), name: sql<string>`min(${profiles.fullName})` }).from(profiles),
    db.select({
      id: latest.id, workflow: latest.workflow, status: latest.status, createdAt: latest.createdAt,
      title: sql<string | null>`coalesce(${jobs.title}, ${latest.output}->>'title')`,
    }).from(latest)
      .leftJoin(applications, eq(latest.applicationId, applications.id))
      .leftJoin(jobs, sql`${jobs.id} = ${applications.jobId} or (${applications.jobId} is null and ${jobs.id}::text = ${latest.input}->>'jobId')`)
      .orderBy(desc(latest.createdAt), desc(latest.id)),
    listApplications(),
    stageSince(),
    mailInbox(),
  ])
  const recent = active.slice(0, 6)
  const now = Date.now()
  const attention = needsAttention(
    active.map((application) => ({
      id: application.id,
      title: application.job.title,
      company: application.job.company?.name ?? "",
      logoPath: application.job.company?.logoPath ?? null,
      status: application.status,
      fit: displayFitScore(application.analysis as StoredAnalysis | null),
      nextStep: application.nextStep,
      nextStepDue: application.nextStepDue,
      since: since.get(application.id) ?? application.createdAt,
      archived: Boolean(application.archivedAt),
    })),
    now,
  )
  const upcoming = active
    .filter((application) => application.nextStepDue && daysUntil(application.nextStepDue, now) > 2 && !CLOSED.includes(application.status))
    .sort((a, b) => a.nextStepDue!.getTime() - b.nextStepDue!.getTime())
    .slice(0, 4)
    .map((application) => ({ id: application.id, title: application.job.title, company: application.job.company?.name ?? "", nextStep: application.nextStep, due: application.nextStepDue! }))
  // Every dated next step on an open application, for the dashboard calendar.
  const events = active
    .filter((application) => application.nextStepDue && !application.archivedAt && !CLOSED.includes(application.status))
    .map((application) => ({ id: application.id, title: application.job.title, company: application.job.company?.name ?? "", logoPath: application.job.company?.logoPath ?? null, nextStep: application.nextStep, due: application.nextStepDue!.toISOString() }))
  const statusCounts: Record<string, number> = {}
  for (const application of active) statusCounts[application.status] = (statusCounts[application.status] ?? 0) + 1
  return {
    statusCounts,
    applications: active.length,
    jobs: jobCount.n,
    verifiedFacts: factCount.n,
    hasProfile: profileCount.n > 0,
    firstName: (profileCount.name ?? "").trim().split(/\s+/)[0] ?? "",
    recentRuns,
    recent,
    attention,
    upcoming,
    events,
    replies: inbox.suggestions,
    now,
  }
}
