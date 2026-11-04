import "server-only"
import { count, desc, eq, sql } from "drizzle-orm"
import { connection } from "next/server"
import { llmConfigured, env } from "@/lib/env"
import { db } from "@/server/db/client"
import { applications, entries, facts, jobs, profiles, runs } from "@/server/db/schema"

export async function getDashboard() {
  await connection()
  const [byStatus, [jobCount], [factCount], [profileCount], recentRuns] = await Promise.all([
    db.select({ status: applications.status, n: count() }).from(applications).groupBy(applications.status),
    db.select({ n: count() }).from(jobs),
    db.select({ n: count() }).from(facts).innerJoin(entries, eq(facts.entryId, entries.id)).where(eq(entries.status, "verified")),
    db.select({ n: count() }).from(profiles),
    db.select().from(runs).orderBy(desc(runs.createdAt)).limit(8),
  ])
  const dbVersion = await db.execute<{ v: string }>(sql`select current_setting('server_version') as v`)
  const statusCounts = Object.fromEntries(byStatus.map((row) => [row.status, row.n])) as Record<string, number>
  return {
    statusCounts,
    applications: byStatus.reduce((sum, row) => sum + row.n, 0),
    jobs: jobCount.n,
    verifiedFacts: factCount.n,
    hasProfile: profileCount.n > 0,
    recentRuns,
    health: {
      db: `PostgreSQL ${dbVersion[0]?.v ?? "?"}`,
      llm: llmConfigured ? `${env.LLM_MODEL} @ ${new URL(env.LLM_BASE_URL).host}` : null,
    },
  }
}
