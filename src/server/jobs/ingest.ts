import "server-only"
import { eq } from "drizzle-orm"
import { sniffImage } from "@/server/assets/image"
import { safeFetch, safeFetchText } from "@/server/assets/safe-fetch"
import { trimLogo } from "@/server/assets/normalize"
import { MAX_IMAGE_BYTES, storeLogo } from "@/server/assets/store"
import { db } from "@/server/db/client"
import { companies, jobs } from "@/server/db/schema"
import { siteLogoCandidates } from "./logo-candidates"
import { jobDraft, parsedJob, type JobDraft, type ParsedJob } from "./schema"
import { isJobHost, postingLogoCandidates, resolveCompanySite } from "./vendor/company-resolver"
import { pickBest, parseSource } from "./select"
import { extractFromText } from "./text-extract"
import { apiCandidates, parseJobDocument, parseJobUrl } from "./vendor/job-parser"
import { startRun } from "@/server/runs/tracer"

export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "company"
  )
}

type Fetched = { html: string; finalUrl: string }

/** Fetch every structured source we know for the link, keep the best parse. */
async function parseFromUrl(input: string): Promise<{ job: ParsedJob; page: Fetched | null; errors: string[] }> {
  const info = parseJobUrl(input)
  const candidates = [...apiCandidates(input), { url: info.canonical || input, kind: "page" }].filter(
    (candidate, index, all) => candidate.url && all.findIndex((item) => item.url === candidate.url) === index,
  )
  let best: ParsedJob | null = null
  let page: Fetched | null = null
  const errors: string[] = []
  for (const candidate of candidates) {
    try {
      const fetched = await safeFetchText(candidate.url)
      if (fetched.status >= 400) throw new Error(`${new URL(candidate.url).host} answered ${fetched.status}`)
      const job = parseSource(candidate.kind, fetched.text, fetched.contentType, input, fetched.finalUrl)
      if (candidate.kind === "page") page = { html: fetched.text, finalUrl: fetched.finalUrl }
      best = pickBest(best ? [best, job] : [job]) ?? job
      if (best.role && best.company && best.description.length > 300 && page) break
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (!best) throw new Error(`Could not read this posting (${errors.at(-1) ?? "no data"}). Paste the job text instead.`)
  // The ATS API answered first: still read the public page once — it usually
  // shows the employer logo and links to the company site.
  if (!page && info.board !== "linkedin") {
    const fetched = await safeFetchText(info.canonical || input).catch(() => null)
    if (fetched && fetched.status < 400 && !/json/i.test(fetched.contentType)) page = { html: fetched.text, finalUrl: fetched.finalUrl }
  }
  return { job: best, page, errors }
}

async function fetchHtml(url: string) {
  const fetched = await safeFetchText(url, 2 * 1024 * 1024).catch(() => null)
  if (!fetched || fetched.status >= 400) return null
  return { html: fetched.text, finalUrl: fetched.finalUrl }
}

/**
 * Download candidates (best sources first), trim padding, and keep the one
 * that will read best in a square slot: squareness matters more than source.
 * Stops early once a high-priority, near-square mark is found.
 */
async function pickLogo(candidates: { url: string; source: string; priority?: number; strictShape?: boolean }[]) {
  const scored: { buffer: Buffer; source: string; score: number }[] = []
  for (const candidate of candidates.slice(0, 10)) {
    try {
      const fetched = await safeFetch(candidate.url, { maxBytes: MAX_IMAGE_BYTES, accept: "image/*" })
      if (fetched.status >= 400 || !sniffImage(fetched.buffer)) continue
      const trimmed = await trimLogo(fetched.buffer)
      if (!trimmed) continue
      const { width, height } = trimmed
      const minSide = Math.min(width, height)
      if (width && height) {
        const aspect = width / height
        const max = candidate.strictShape ? 1.6 : 3.2
        if (aspect > max || aspect < 1 / max || minSide < 32) continue
      }
      const squareness = width && height ? Math.min(width / height, height / width) : 0.8
      const resolution = Math.min(1, minSide / 128)
      const priority = (candidate.priority ?? 90) / 100
      const score = squareness * 0.55 + priority * 0.25 + resolution * 0.2
      scored.push({ buffer: trimmed.buffer, source: candidate.source, score })
      if (squareness > 0.85 && priority >= 0.8 && resolution >= 1) break
    } catch {
      // try the next candidate
    }
  }
  const best = scored.sort((a, b) => b.score - a.score)[0]
  if (!best) return null
  const stored = await storeLogo(best.buffer)
  return { path: stored.path, source: best.source }
}

/**
 * Turn a link or pasted text into a reviewable draft. Writes nothing to the
 * jobs table; only a logo file may be stored (content-addressed, harmless).
 */
export async function previewJob(input: { url?: string; text?: string }): Promise<JobDraft & { runId: string }> {
  const url = input.url?.trim() ?? ""
  const pasted = input.text?.trim() ?? ""
  const run = await startRun("job.preview", { url, textLength: pasted.length })
  try {
    const { job, page, errors } = url
      ? await run.step("fetch & parse", () => parseFromUrl(url), (value) => `${value.job.source} · confidence ${value.job.confidence}${value.errors.length ? ` · ${value.errors.length} source(s) failed` : ""}`)
      : await run.step("parse text", async () => ({ job: parsedJob.parse(parseJobDocument({ text: pasted })), page: null, errors: [] as string[] }), (value) => `confidence ${value.job.confidence}`)

    // Prefer the pasted text when the page only gave a teaser.
    const description = pasted.length > job.description.length ? pasted : job.description

    // Fill what the parser left empty from the text itself (always for pasted
    // text). Every filled field records the rule that found it.
    const hints: Record<string, string> = {}
    const extracted = extractFromText(url ? description : pasted)
    if ((!job.role || !url) && extracted.role) {
      job.role = extracted.role
      hints.title = extracted.evidence.role ?? "text"
    }
    if ((!job.company || !url) && extracted.company) {
      job.company = extracted.company
      hints.company = extracted.evidence.company ?? "text"
    }
    if ((!job.location || !url) && extracted.location) {
      job.location = extracted.location
      hints.location = extracted.evidence.location ?? "text"
    }
    if (!job.remote && extracted.remote) job.remote = extracted.remote
    job.warnings = job.warnings.filter(
      (warning) => !(job.role && /role title was not detected/i.test(warning)) && !(job.company && /company was not detected/i.test(warning)),
    )
    const known = job.company ? await db.query.companies.findFirst({ where: eq(companies.slug, slugify(job.company)) }) : undefined

    const site = known?.website
      ? { url: known.website, source: "known company", confidence: 1 }
      : await run.step(
          "resolve company site",
          () =>
            resolveCompanySite(
              {
                company: job.company,
                pageUrl: url,
                finalUrl: page?.finalUrl ?? "",
                structuredUrls: [job.companyUrl, ...job.companyLinks].filter((value) => value && !isJobHost(value)),
                html: page?.html ?? "",
                description,
              },
              fetchHtml,
            ),
          (value) => (value.url ? `${value.url} (${value.source})` : "not found"),
        )

    let logo: { path: string; source: string } | null = known?.logoPath ? { path: known.logoPath, source: "known company" } : null
    if (!logo) {
      logo = await run.step(
        "find logo",
        async () => {
          const fromPosting = page ? postingLogoCandidates(page.html, page.finalUrl, { company: job.company, structuredLogo: job.companyLogo }) : job.companyLogo ? [{ url: job.companyLogo, source: "structured-data" }] : []
          const home = site.url ? await fetchHtml(site.url) : null
          const fromSite = home ? siteLogoCandidates(home.html, home.finalUrl) : []
          return pickLogo([...fromPosting.map((item) => ({ ...item, priority: Math.min("priority" in item ? item.priority : 92, 92), strictShape: false })), ...fromSite])
        },
        (value) => (value ? value.source : "none"),
      )
    }

    const info = url ? parseJobUrl(url) : null
    const warnings = [...job.warnings]
    if (!site.url) warnings.push("Company website not found on the posting. Add it if you know it — it improves research and the logo.")
    if (errors.length && description.length < 300) warnings.push(`Some sources failed: ${errors.at(-1)}`)

    const draft = {
      sourceUrl: url,
      canonicalUrl: info?.canonical ?? "",
      board: url ? job.board : "manual",
      externalId: job.jobId,
      company: job.company,
      companyWebsite: site.url,
      companyWebsiteSource: site.source,
      logoPath: logo?.path ?? null,
      logoSource: logo?.source ?? "",
      title: job.role,
      location: job.location,
      remote: job.remote,
      employmentType: job.employmentType,
      salary: job.salary,
      language: /^[a-z]{2}$/.test(job.language) ? job.language : "en",
      postedAt: job.postedAt,
      rawText: description,
      parseConfidence: Object.keys(hints).length ? Math.min(0.9, job.confidence + Object.keys(hints).length * 0.15) : job.confidence,
      warnings: [...new Set(warnings)],
      hints,
    }
    await run.finish("succeeded", { company: draft.company, title: draft.title, confidence: draft.parseConfidence, website: draft.companyWebsite, logo: draft.logoSource })
    return { ...draft, runId: run.id }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

/** Persist a reviewed draft. Idempotent on the canonical URL. */
export async function saveJob(input: JobDraft) {
  const draft = jobDraft.parse(input)
  return db.transaction(async (tx) => {
    const slug = slugify(draft.company)
    const [company] = await tx
      .insert(companies)
      .values({ name: draft.company, slug, website: draft.companyWebsite || null, websiteSource: draft.companyWebsiteSource || null, logoPath: draft.logoPath, logoSource: draft.logoSource || null })
      .onConflictDoUpdate({
        target: companies.slug,
        set: { name: draft.company, website: draft.companyWebsite || null, websiteSource: draft.companyWebsiteSource || null, logoPath: draft.logoPath, logoSource: draft.logoSource || null },
      })
      .returning()
    const values = {
      companyId: company.id,
      sourceUrl: draft.sourceUrl || null,
      canonicalUrl: draft.canonicalUrl || null,
      board: draft.board,
      externalId: draft.externalId || null,
      title: draft.title,
      location: draft.location,
      remote: draft.remote,
      employmentType: draft.employmentType,
      salary: draft.salary,
      language: draft.language,
      postedAt: draft.postedAt && !Number.isNaN(Date.parse(draft.postedAt)) ? new Date(draft.postedAt) : null,
      rawText: draft.rawText,
      parseConfidence: draft.parseConfidence,
      parseWarnings: draft.warnings,
    }
    const [job] = draft.canonicalUrl
      ? await tx.insert(jobs).values(values).onConflictDoUpdate({ target: jobs.canonicalUrl, set: values }).returning()
      : await tx.insert(jobs).values(values).returning()
    return job
  })
}

export async function listJobs() {
  return db.query.jobs.findMany({ with: { company: true }, orderBy: (table, { desc }) => [desc(table.createdAt)] })
}

export async function getJob(id: string) {
  return db.query.jobs.findFirst({ where: eq(jobs.id, id), with: { company: true } })
}
