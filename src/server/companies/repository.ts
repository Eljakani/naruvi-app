import "server-only"
import { asc, desc, eq, sql } from "drizzle-orm"
import { likePattern } from "@/lib/search"
import { SAME_ROLE, titleSimilarity } from "@/lib/similar"
import { companyBrandingFromLink, slugify } from "@/server/jobs/ingest"
import { normalizeWebsite } from "@/lib/company-input"
import { displayFitScore, type Analysis } from "@/server/analysis/match"
import { db } from "@/server/db/client"
import { applications, companies, jobs } from "@/server/db/schema"

const fitOf = (analysis: unknown) => displayFitScore(analysis as Pick<Analysis, "fitScore" | "counts"> | null)

/** Every company with how many jobs and applications it has, most recent activity first. */
export async function listCompanies(q?: string) {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      website: companies.website,
      logoPath: companies.logoPath,
      researched: sql<boolean>`${companies.research} is not null`,
      jobs: sql<number>`count(distinct ${jobs.id})`.mapWith(Number),
      applications: sql<number>`count(distinct ${applications.id})`.mapWith(Number),
      active: sql<number>`count(distinct ${applications.id}) filter (where ${applications.archivedAt} is null and ${applications.status} not in ('rejected', 'withdrawn'))`.mapWith(Number),
      sent: sql<number>`count(distinct ${applications.id}) filter (where ${applications.status} in ('submitted', 'interviewing', 'offer', 'rejected'))`.mapWith(Number),
      last: sql<Date>`greatest(max(${jobs.createdAt}), max(${applications.updatedAt}), ${companies.updatedAt})`.mapWith((value) => new Date(value)),
    })
    .from(companies)
    .leftJoin(jobs, eq(jobs.companyId, companies.id))
    .leftJoin(applications, eq(applications.jobId, jobs.id))
    .where(q?.trim() ? sql`${companies.name} ilike ${likePattern(q)}` : undefined)
    .groupBy(companies.id)
    .orderBy(desc(sql`9`), asc(companies.name))
  return rows
}

/** One company with all its jobs, their applications and the research brief. */
export async function getCompany(id: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, id))
  if (!company) return null
  const rows = await db
    .select({
      id: jobs.id, title: jobs.title, location: jobs.location, createdAt: jobs.createdAt, tags: jobs.tags,
      applicationId: applications.id, status: applications.status, archivedAt: applications.archivedAt, updatedAt: applications.updatedAt, analysis: applications.analysis,
      nextStep: applications.nextStep, nextStepDue: applications.nextStepDue,
    })
    .from(jobs)
    .leftJoin(applications, eq(applications.jobId, jobs.id))
    .where(eq(jobs.companyId, id))
    .orderBy(desc(jobs.createdAt))
  return { ...company, jobs: rows.map(({ analysis, ...row }) => ({ ...row, fit: fitOf(analysis) })) }
}

/**
 * Jobs that may be the same posting as a new draft: the same link, or the
 * same company with a very similar title. Shown before saving so the person
 * can open the existing one instead of creating a copy.
 */
export async function findDuplicates(draft: { company: string; title: string; canonicalUrl?: string; sourceUrl?: string }) {
  const slug = slugify(draft.company)
  const rows = await db
    .select({ id: jobs.id, title: jobs.title, canonicalUrl: jobs.canonicalUrl, sourceUrl: jobs.sourceUrl, createdAt: jobs.createdAt, company: companies.name, applicationId: applications.id, status: applications.status })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(applications, eq(applications.jobId, jobs.id))
    .where(
      sql`${companies.slug} = ${slug}${draft.canonicalUrl ? sql` or ${jobs.canonicalUrl} = ${draft.canonicalUrl}` : sql``}${draft.sourceUrl ? sql` or ${jobs.sourceUrl} = ${draft.sourceUrl}` : sql``}`,
    )
  return rows
    .map((row) => {
      const sameLink = Boolean((draft.canonicalUrl && row.canonicalUrl === draft.canonicalUrl) || (draft.sourceUrl && row.sourceUrl === draft.sourceUrl))
      return { ...row, sameLink, similarity: titleSimilarity(draft.title, row.title) }
    })
    .filter((row) => row.sameLink || row.similarity >= SAME_ROLE)
    .sort((a, b) => Number(b.sameLink) - Number(a.sameLink) || b.similarity - a.similarity)
    .slice(0, 3)
}

/** Every tag in use, most used first. */
export async function allTags() {
  const rows = await db.execute<{ tag: string; n: number }>(sql`select tag, count(*)::int as n from ${jobs}, unnest(${jobs.tags}) as tag group by tag order by n desc, tag asc limit 100`)
  return rows.map((row) => ({ tag: row.tag, count: Number(row.n) }))
}

export async function setJobTags(jobId: string, tags: string[]) {
  const [row] = await db.update(jobs).set({ tags }).where(eq(jobs.id, jobId)).returning({ id: jobs.id })
  if (!row) throw new Error("Job not found.")
}

/**
 * Create a company (or return the existing one with the same name) without
 * needing a job from it. A website, when given, also brings its logo.
 */
export async function saveCompany(input: { name: string; website?: string }) {
  const name = input.name.trim()
  if (!name) throw new Error("Enter the company’s name.")
  const website = input.website ? normalizeWebsite(input.website) : ""
  if (input.website?.trim() && !website) throw new Error("Use the company’s own website, like dashlane.com (not LinkedIn or a job board).")
  const branding = website ? await companyBrandingFromLink(website).catch(() => null) : null
  const [company] = await db
    .insert(companies)
    .values({ name, slug: slugify(name), website: website || undefined, websiteSource: website ? "you" : undefined, logoPath: branding?.logo?.path, logoSource: branding?.logo?.source })
    .onConflictDoUpdate({
      target: companies.slug,
      set: {
        website: sql`coalesce(excluded.website, ${companies.website})`,
        websiteSource: sql`case when excluded.website is not null then excluded.website_source else ${companies.websiteSource} end`,
        logoPath: sql`coalesce(${companies.logoPath}, excluded.logo_path)`,
        logoSource: sql`case when ${companies.logoPath} is null then excluded.logo_source else ${companies.logoSource} end`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: companies.id, name: companies.name, website: companies.website })
  return company
}

/** Set (or correct) a company's website; fetches its logo if it has none. */
export async function setCompanyWebsite(id: string, value: string) {
  const website = normalizeWebsite(value)
  if (!website) throw new Error("Use the company’s own website, like dashlane.com (not LinkedIn or a job board).")
  const [current] = await db.select({ logoPath: companies.logoPath }).from(companies).where(eq(companies.id, id))
  if (!current) throw new Error("Company not found.")
  const branding = current.logoPath ? null : await companyBrandingFromLink(website).catch(() => null)
  await db.update(companies).set({ website, websiteSource: "you", ...(branding?.logo ? { logoPath: branding.logo.path, logoSource: branding.logo.source } : {}) }).where(eq(companies.id, id))
  return website
}
