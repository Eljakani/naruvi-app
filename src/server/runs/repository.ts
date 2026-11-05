import "server-only"
import { and, desc, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm"
import { db } from "@/server/db/client"
import { applications, documents, jobs, revisions, runs, runSteps } from "@/server/db/schema"

/** Only operational metadata; never return prompts, responses or run input/output payloads. */
const stepColumns = {
  id: runSteps.id, runId: runSteps.runId, name: runSteps.name, status: runSteps.status,
  model: runSteps.model, inputTokens: runSteps.inputTokens, outputTokens: runSteps.outputTokens,
  latencyMs: runSteps.latencyMs, detail: runSteps.detail, error: runSteps.error, createdAt: runSteps.createdAt,
}

export async function listRuns(filter: { workflow?: string; status?: string } = {}) {
  const where: SQL[] = []
  if (filter.workflow) where.push(eq(runs.workflow, filter.workflow))
  if (filter.status === "failed" || filter.status === "succeeded" || filter.status === "running") where.push(eq(runs.status, filter.status))
  const rows = await db
    .select({ id: runs.id, workflow: runs.workflow, status: runs.status, error: runs.error, startedAt: runs.startedAt, finishedAt: runs.finishedAt, createdAt: runs.createdAt, applicationId: runs.applicationId })
    .from(runs)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(runs.createdAt))
    .limit(100)
  const counts = rows.length
    ? await db.select({ runId: runSteps.runId, steps: sql<number>`count(*)::int`, tokens: sql<number>`coalesce(sum(coalesce(${runSteps.inputTokens},0) + coalesce(${runSteps.outputTokens},0)),0)::int`, model: sql<string | null>`max(${runSteps.model})` }).from(runSteps).where(inArray(runSteps.runId, rows.map((row) => row.id))).groupBy(runSteps.runId)
    : []
  const byRun = new Map(counts.map((row) => [row.runId, row]))
  return rows.map((row) => ({ ...row, steps: byRun.get(row.id)?.steps ?? 0, tokens: byRun.get(row.id)?.tokens ?? 0, model: byRun.get(row.id)?.model ?? null, durationMs: row.startedAt && row.finishedAt ? row.finishedAt.getTime() - row.startedAt.getTime() : null }))
}

export async function workflows() {
  const rows = await db.selectDistinct({ workflow: runs.workflow }).from(runs).orderBy(runs.workflow)
  return rows.map((row) => row.workflow)
}

export async function runStats(days = 7) {
  const since = new Date(Date.now() - days * 86_400_000)
  const [summary] = await db
    .select({
      total: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${runs.status} = 'failed')::int`,
      p50: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${runs.finishedAt} - ${runs.startedAt})) * 1000)`,
      p95: sql<number | null>`percentile_cont(0.95) within group (order by extract(epoch from (${runs.finishedAt} - ${runs.startedAt})) * 1000)`,
    })
    .from(runs)
    .where(gte(runs.createdAt, since))
  const [tokens] = await db.select({ n: sql<number>`coalesce(sum(coalesce(${runSteps.inputTokens},0) + coalesce(${runSteps.outputTokens},0)),0)::int` }).from(runSteps).where(gte(runSteps.createdAt, since))
  return { days, total: summary.total, failed: summary.failed, p50: summary.p50, p95: summary.p95, tokens: tokens.n }
}

export async function getRun(id: string) {
  const [run] = await db.select({ id: runs.id, workflow: runs.workflow, status: runs.status, error: runs.error, startedAt: runs.startedAt, finishedAt: runs.finishedAt, createdAt: runs.createdAt, applicationId: runs.applicationId }).from(runs).where(eq(runs.id, id))
  if (!run) return null
  const steps = await db.select(stepColumns).from(runSteps).where(eq(runSteps.runId, id)).orderBy(runSteps.createdAt)
  const application = run.applicationId
    ? (await db.select({ id: applications.id, title: jobs.title }).from(applications).innerJoin(jobs, eq(applications.jobId, jobs.id)).where(eq(applications.id, run.applicationId)))[0] ?? null
    : null
  return { ...run, steps, application }
}

/** Quality of generated documents: latest revision per document plus check failure rates. */
export async function documentQuality() {
  const latest = await db
    .selectDistinctOn([revisions.documentId], { documentId: revisions.documentId, kind: documents.kind, quality: revisions.quality, createdAt: revisions.createdAt })
    .from(revisions)
    .innerJoin(documents, eq(revisions.documentId, documents.id))
    .where(isNotNull(revisions.quality))
    .orderBy(revisions.documentId, desc(revisions.createdAt))
  const scored = latest.filter((row) => row.quality)
  const checks = new Map<string, { label: string; fail: number; warn: number; total: number }>()
  for (const row of scored) {
    for (const item of row.quality!.checks) {
      const entry = checks.get(item.id) ?? { label: item.label, fail: 0, warn: 0, total: 0 }
      entry.total += 1
      if (item.status === "fail") entry.fail += 1
      if (item.status === "warn") entry.warn += 1
      checks.set(item.id, entry)
    }
  }
  const average = scored.length ? Math.round(scored.reduce((sum, row) => sum + row.quality!.score, 0) / scored.length) : null
  return {
    documents: scored.length,
    average,
    clean: scored.filter((row) => row.quality!.errors === 0).length,
    checks: [...checks.entries()].map(([id, value]) => ({ id, ...value })).sort((a, b) => b.fail + b.warn - (a.fail + a.warn)),
  }
}
