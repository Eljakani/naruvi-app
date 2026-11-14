import "server-only"
import { eq, or } from "drizzle-orm"
import { canonicalJobUrl } from "@/lib/job-alerts"
import { after } from "next/server"
import { fitCheckState, trackJob } from "@/server/applications/repository"
import { readAsset } from "@/server/assets/store"
import { db } from "@/server/db/client"
import { applications, companies, contacts, jobs } from "@/server/db/schema"
import { saveJob } from "@/server/jobs/ingest"
import { refreshJobInsights } from "@/server/jobs/insights"
import { markLeadImported } from "@/server/jobs/leads"
import type { JobDraft } from "@/server/jobs/schema"
import { scheduleResearch } from "@/server/research/auto"

/** Logos are served behind the app session; API clients get small ones inline instead. */
export async function logoDataUrl(path: string | null | undefined, maxBytes = 160 * 1024) {
  if (!path) return null
  const asset = await readAsset(path).catch(() => null)
  if (!asset || asset.buffer.length > maxBytes || asset.mime === "image/svg+xml") return null
  return `data:${asset.mime};base64,${asset.buffer.toString("base64")}`
}

/**
 * Save a reviewed draft and start tracking it, exactly as the Add-a-job dialog
 * does. Returns as soon as the job is stored: the insights, the fit check and
 * the company research all run after the response, side by side.
 */
export async function saveAndTrackJob(draft: JobDraft) {
  const job = await saveJob(draft)
  await markLeadImported(job.id, [draft.sourceUrl, draft.canonicalUrl])
  const applicationId = await trackJob(job.id)
  const checking = applicationId ? (await fitCheckState(job.id).catch(() => null))?.state === "running" : false
  const enrich = () => refreshJobInsights(job.id).then(() => undefined, () => undefined)
  try {
    after(enrich)
  } catch {
    void enrich()
  }
  scheduleResearch(job.id)
  return { id: job.id, applicationId, checking }
}

/** What Naruvi already knows about a page: a saved job at that link, or a contact for that LinkedIn profile. */
export async function lookupPage(rawUrl: string) {
  const canonical = canonicalJobUrl(rawUrl)?.url ?? null
  const clean = rawUrl.replace(/[?#].*$/, "").replace(/\/$/, "")
  const [job] = await db
    .select({ id: jobs.id, title: jobs.title, company: companies.name, logoPath: companies.logoPath, applicationId: applications.id, status: applications.status })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(applications, eq(applications.jobId, jobs.id))
    .where(or(eq(jobs.sourceUrl, rawUrl), eq(jobs.sourceUrl, clean), ...(canonical ? [eq(jobs.canonicalUrl, canonical)] : [])))
    .limit(1)
  const contact = /linkedin\.com\/in\//.test(clean)
    ? (await db.select({ id: contacts.id, name: contacts.name, title: contacts.title }).from(contacts).where(eq(contacts.linkedinUrl, clean)).limit(1))[0] ?? null
    : null
  return { job: job ?? null, contact }
}
