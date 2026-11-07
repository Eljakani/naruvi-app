import "server-only"
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm"
import { likePattern, prefixQuery } from "@/lib/search"
import { db } from "@/server/db/client"
import { applications, companies, jobs } from "@/server/db/schema"

export const JOB_SORTS = { newest: "Newest first", oldest: "Oldest first", fit: "Best fit", company: "Company A–Z" } as const
export type JobSort = keyof typeof JOB_SORTS
export const JOB_STAGES = { new: "Not tracked yet", all: "Every posting", active: "Tracked, in progress", closed: "Closed or archived" } as const
export type JobStage = keyof typeof JOB_STAGES

export type JobFilter = { q?: string; workMode?: string; contract?: string; seniority?: string; tag?: string; stage?: JobStage; sort?: JobSort; page?: number }
export const JOBS_PER_PAGE = 30

const CLOSED_SQL = sql`(${applications.status} in ('rejected', 'withdrawn') or ${applications.archivedAt} is not null)`
const fitSql = sql<number | null>`case when ${applications.analysis} is not null and coalesce((${applications.analysis}->'counts'->>'met')::int, 0) + coalesce((${applications.analysis}->'counts'->>'partial')::int, 0) + coalesce((${applications.analysis}->'counts'->>'gap')::int, 0) > 0 then (${applications.analysis}->>'fitScore')::int end`

/** Jobs matching a search and filters, one page at a time, with their application if any. */
export async function searchJobs(filter: JobFilter) {
  const where: SQL[] = []
  const query = filter.q ? prefixQuery(filter.q) : null
  if (query) where.push(sql`(${jobs.search} @@ to_tsquery('simple', ${query}) or ${companies.name} ilike ${likePattern(filter.q!)})`)
  for (const key of ["workMode", "contract", "seniority"] as const) {
    if (filter[key]) where.push(sql`${jobs.insights}->>${key} = ${filter[key]}`)
  }
  if (filter.tag) where.push(sql`${jobs.tags} @> array[${filter.tag}]::text[]`)
  if (filter.stage === "new") where.push(sql`${applications.id} is null`)
  if (filter.stage === "active") where.push(sql`${applications.id} is not null and not ${CLOSED_SQL}`)
  if (filter.stage === "closed") where.push(CLOSED_SQL)

  const order = {
    newest: [desc(jobs.createdAt)],
    oldest: [asc(jobs.createdAt)],
    fit: [sql`${fitSql} desc nulls last`, desc(jobs.createdAt)],
    company: [sql`lower(${companies.name}) asc nulls last`, desc(jobs.createdAt)],
  }[filter.sort ?? "newest"]
  // With a search and the default order, the best matches come first.
  const rank = query && (filter.sort ?? "newest") === "newest" ? [sql`ts_rank(${jobs.search}, to_tsquery('simple', ${query})) desc`] : []
  const page = Math.max(1, Math.floor(filter.page ?? 1))

  const rows = await db
    .select({
      id: jobs.id, title: jobs.title, tags: jobs.tags, location: jobs.location, remote: jobs.remote, language: jobs.language, board: jobs.board, createdAt: jobs.createdAt,
      insights: sql<{ workMode?: string; contract?: string; seniority?: string } | null>`${jobs.insights}`,
      company: companies.name, logoPath: companies.logoPath,
      applicationId: applications.id, status: applications.status, archivedAt: applications.archivedAt, fit: fitSql,
      total: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(applications, eq(applications.jobId, jobs.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(...rank, ...order)
    .limit(JOBS_PER_PAGE)
    .offset((page - 1) * JOBS_PER_PAGE)
  const total = rows[0]?.total ?? (page > 1 ? (await countJobs(where)) : 0)
  return { jobs: rows, total, page, pages: Math.max(1, Math.ceil(total / JOBS_PER_PAGE)) }
}

async function countJobs(where: SQL[]) {
  const [row] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(jobs).leftJoin(companies, eq(companies.id, jobs.companyId)).leftJoin(applications, eq(applications.jobId, jobs.id)).where(where.length ? and(...where) : undefined)
  return row?.n ?? 0
}

/** Which filter values exist, so filters only offer what can match. */
export async function jobFacets() {
  const rows = await db
    .select({ workMode: sql<string | null>`${jobs.insights}->>'workMode'`, contract: sql<string | null>`${jobs.insights}->>'contract'`, seniority: sql<string | null>`${jobs.insights}->>'seniority'`, n: sql<number>`count(*)`.mapWith(Number) })
    .from(jobs)
    .groupBy(sql`1`, sql`2`, sql`3`)
  const tally = (key: "workMode" | "contract" | "seniority") => {
    const counts = new Map<string, number>()
    for (const row of rows) if (row[key] && row[key] !== "unspecified") counts.set(row[key]!, (counts.get(row[key]!) ?? 0) + row.n)
    return counts
  }
  const [{ n: all }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(jobs)
  return { workMode: tally("workMode"), contract: tally("contract"), seniority: tally("seniority"), total: all }
}

/** A few results of each kind for the command menu. */
export async function quickSearch(q: string) {
  const query = prefixQuery(q)
  if (!query) return { jobs: [], companies: [] }
  const [jobRows, companyRows] = await Promise.all([
    db
      .select({ id: jobs.id, title: jobs.title, company: companies.name, applicationId: applications.id })
      .from(jobs)
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .leftJoin(applications, eq(applications.jobId, jobs.id))
      .where(sql`${jobs.search} @@ to_tsquery('simple', ${query}) or ${companies.name} ilike ${likePattern(q)}`)
      .orderBy(sql`ts_rank(${jobs.search}, to_tsquery('simple', ${query})) desc`, desc(jobs.createdAt))
      .limit(8),
    db
      .select({ id: companies.id, name: companies.name, jobId: sql<string | null>`(select ${jobs.id} from ${jobs} where ${jobs.companyId} = ${companies.id} order by ${jobs.createdAt} desc limit 1)` })
      .from(companies)
      .where(sql`${companies.name} ilike ${likePattern(q)}`)
      .orderBy(asc(companies.name))
      .limit(4),
  ])
  return { jobs: jobRows, companies: companyRows }
}
