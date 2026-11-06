import "server-only"
import { count, desc, eq, isNull, sql } from "drizzle-orm"
import { connection } from "next/server"
import { getLlmOverview } from "@/server/settings/llm"
import { db } from "@/server/db/client"
import { CLOSED, daysUntil, needsAttention } from "@/lib/attention"
import { listApplications, type StoredAnalysis } from "@/server/applications/repository"
import { displayFitScore } from "@/server/analysis/match"
import { stageSince } from "@/server/tracking/service"
import { mailInbox } from "@/server/mail/classify"
import { applications, entries, facts, jobs, profiles, runs } from "@/server/db/schema"

export async function getDashboard() {
  await connection()
  const [byStatus, [jobCount], [factCount], [profileCount], recentRuns] = await Promise.all([
    db.select({ status: applications.status, n: count() }).from(applications).where(isNull(applications.archivedAt)).groupBy(applications.status),
    db.select({ n: count() }).from(jobs),
    db.select({ n: count() }).from(facts).innerJoin(entries, eq(facts.entryId, entries.id)).where(eq(entries.status, "verified")),
    db.select({ n: count() }).from(profiles),
    db.select().from(runs).orderBy(desc(runs.createdAt)).limit(6),
  ])
  const llm = await getLlmOverview()
  const [active, since, inbox] = await Promise.all([listApplications(), stageSince(), mailInbox()])
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
  const dbVersion = await db.execute<{ v: string }>(sql`select current_setting('server_version') as v`)
  const statusCounts = Object.fromEntries(byStatus.map((row) => [row.status, row.n])) as Record<string, number>
  return {
    statusCounts,
    applications: byStatus.reduce((sum, row) => sum + row.n, 0),
    jobs: jobCount.n,
    verifiedFacts: factCount.n,
    hasProfile: profileCount.n > 0,
    recentRuns,
    recent,
    attention,
    upcoming,
    replies: inbox.suggestions,
    now,
    health: {
      db: `PostgreSQL ${dbVersion[0]?.v ?? "?"}`,
      llm: llm.configured ? `${llm.model} @ ${new URL(llm.baseUrl).host}` : null,
    },
  }
}
