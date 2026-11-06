import "server-only"
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, sql, type SQL } from "drizzle-orm"
import { db } from "@/server/db/client"
import { applications, companies, documents, jobs, revisions, runs, runSteps } from "@/server/db/schema"

/** Only operational metadata; never return prompts, responses or run input/output payloads. */
const stepColumns = {
  id: runSteps.id, runId: runSteps.runId, name: runSteps.name, status: runSteps.status,
  model: runSteps.model, inputTokens: runSteps.inputTokens, outputTokens: runSteps.outputTokens,
  latencyMs: runSteps.latencyMs, detail: runSteps.detail, error: runSteps.error, createdAt: runSteps.createdAt,
}

export const RANGES = { "24h": 1, "7d": 7, "30d": 30, all: null } as const
export type Range = keyof typeof RANGES
export const isRange = (value: unknown): value is Range => typeof value === "string" && Object.hasOwn(RANGES, value)
const sinceOf = (range: Range) => (RANGES[range] ? new Date(Date.now() - RANGES[range]! * 86_400_000) : null)

/** Developer checks (model smoke tests) are kept out of the normal view. */
const DEV = sql`${runs.workflow} like 'ai.sdk.%'`

function runFilter(filter: { workflow?: string; status?: string; range?: Range; dev?: boolean }) {
  const where: SQL[] = []
  if (filter.workflow) where.push(eq(runs.workflow, filter.workflow))
  else if (!filter.dev) where.push(sql`not (${DEV})`)
  if (filter.status === "failed" || filter.status === "succeeded" || filter.status === "running") where.push(eq(runs.status, filter.status))
  const since = filter.range ? sinceOf(filter.range) : null
  if (since) where.push(gte(runs.createdAt, since))
  return where
}

export const PAGE_SIZE = 50

export async function listRuns(filter: { workflow?: string; status?: string; range?: Range; before?: Date } = {}) {
  const where = runFilter(filter)
  if (filter.before) where.push(lt(runs.createdAt, filter.before))
  const rows = await db
    .select({ id: runs.id, workflow: runs.workflow, status: runs.status, error: runs.error, startedAt: runs.startedAt, finishedAt: runs.finishedAt, createdAt: runs.createdAt, applicationId: runs.applicationId, job: jobs.title, company: companies.name })
    .from(runs)
    .leftJoin(applications, eq(applications.id, runs.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(runs.createdAt))
    .limit(PAGE_SIZE + 1)
  const page = rows.slice(0, PAGE_SIZE)
  const counts = page.length
    ? await db
        .select({
          runId: runSteps.runId,
          steps: sql<number>`count(*)::int`,
          failedSteps: sql<number>`count(*) filter (where ${runSteps.status} = 'failed')::int`,
          aiCalls: sql<number>`count(*) filter (where ${runSteps.model} is not null)::int`,
          tokens: sql<number>`coalesce(sum(coalesce(${runSteps.inputTokens},0) + coalesce(${runSteps.outputTokens},0)),0)::int`,
          models: sql<string[]>`coalesce(array_agg(distinct ${runSteps.model}) filter (where ${runSteps.model} is not null), '{}')`,
        })
        .from(runSteps)
        .where(inArray(runSteps.runId, page.map((row) => row.id)))
        .groupBy(runSteps.runId)
    : []
  const byRun = new Map(counts.map((row) => [row.runId, row]))
  return {
    more: rows.length > PAGE_SIZE,
    runs: page.map((row) => {
      const c = byRun.get(row.id)
      return { ...row, steps: c?.steps ?? 0, failedSteps: c?.failedSteps ?? 0, aiCalls: c?.aiCalls ?? 0, tokens: c?.tokens ?? 0, models: c?.models ?? [], durationMs: row.startedAt && row.finishedAt ? row.finishedAt.getTime() - row.startedAt.getTime() : null }
    }),
  }
}

export async function workflows() {
  const rows = await db.select({ workflow: runs.workflow, n: sql<number>`count(*)::int` }).from(runs).groupBy(runs.workflow).orderBy(desc(sql`count(*)`))
  return rows.map((row) => row.workflow)
}

const p = (q: number) => sql<number | null>`percentile_cont(${sql.raw(String(q))}) within group (order by extract(epoch from (${runs.finishedAt} - ${runs.startedAt})) * 1000)`

/** Totals, a per-day series and a per-workflow breakdown for the chosen range. */
export async function runStats(filter: { workflow?: string; range: Range }) {
  const where = runFilter({ workflow: filter.workflow, range: filter.range })
  const condition = where.length ? and(...where) : undefined
  const [summary] = await db
    .select({ total: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${runs.status} = 'failed')::int`, running: sql<number>`count(*) filter (where ${runs.status} = 'running')::int`, p50: p(0.5), p95: p(0.95) })
    .from(runs).where(condition)
  const [usage] = await db
    .select({ tokens: sql<number>`coalesce(sum(coalesce(${runSteps.inputTokens},0) + coalesce(${runSteps.outputTokens},0)),0)::int`, aiCalls: sql<number>`count(*) filter (where ${runSteps.model} is not null)::int` })
    .from(runSteps).innerJoin(runs, eq(runs.id, runSteps.runId)).where(condition)
  const days = RANGES[filter.range] ?? 30
  const dailyWhere = [...runFilter({ workflow: filter.workflow, range: "all" }), gte(runs.createdAt, new Date(Date.now() - Math.max(days, 7) * 86_400_000))]
  const daily = await db
    .select({ day: sql<string>`to_char(date_trunc('day', ${runs.createdAt}), 'YYYY-MM-DD')`, total: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${runs.status} = 'failed')::int` })
    .from(runs).where(and(...dailyWhere)).groupBy(sql`1`).orderBy(sql`1`)
  const byWorkflow = await db
    .select({ workflow: runs.workflow, total: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${runs.status} = 'failed')::int`, p50: p(0.5), last: sql<Date>`max(${runs.createdAt})` })
    .from(runs).where(and(...runFilter({ range: filter.range }))).groupBy(runs.workflow).orderBy(desc(sql`count(*)`))
  return { ...summary, ...usage, daily, byWorkflow, days: Math.max(days, 7), now: Date.now() }
}

export async function getRun(id: string) {
  const [run] = await db
    .select({ id: runs.id, workflow: runs.workflow, status: runs.status, error: runs.error, startedAt: runs.startedAt, finishedAt: runs.finishedAt, createdAt: runs.createdAt, applicationId: runs.applicationId, job: jobs.title, company: companies.name })
    .from(runs)
    .leftJoin(applications, eq(applications.id, runs.applicationId))
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(runs.id, id))
  if (!run) return null
  const steps = await db.select(stepColumns).from(runSteps).where(eq(runSteps.runId, id)).orderBy(runSteps.createdAt)
  // Neighbours in time, for previous/next navigation.
  const [older] = await db.select({ id: runs.id }).from(runs).where(and(lt(runs.createdAt, run.createdAt), sql`not (${DEV})`)).orderBy(desc(runs.createdAt)).limit(1)
  const [newer] = await db.select({ id: runs.id }).from(runs).where(and(gt(runs.createdAt, run.createdAt), sql`not (${DEV})`)).orderBy(asc(runs.createdAt)).limit(1)
  return { ...run, steps, older: older?.id ?? null, newer: newer?.id ?? null, now: Date.now() }
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
