import "server-only"
import { eq } from "drizzle-orm"
import { sniffImage } from "@/server/assets/image"
import { safeFetch, safeFetchText } from "@/server/assets/safe-fetch"
import { trimLogo } from "@/server/assets/normalize"
import { MAX_IMAGE_BYTES, storeLogo } from "@/server/assets/store"
import { db } from "@/server/db/client"
import { companies, jobs } from "@/server/db/schema"
import { siteLogoCandidates } from "./logo-candidates"
import { jobDraft, parsedJob, type JobDraft } from "./schema"
import { isJobHost, postingLogoCandidates, resolveCompanySite } from "./vendor/company-resolver"
import { parseFromUrl } from "./url-source"
import { renderJobPage } from "./browser"
import { extractFromText } from "./text-extract"
import { parseJobDocument, parseJobUrl } from "./vendor/job-parser"
import { startRun } from "@/server/runs/tracer"
import { completionForRun } from "@/server/llm/client"
import { getLlmOverview } from "@/server/settings/llm"
import { extractJobFields, JOB_FIELDS_PROMPT_VERSION } from "./ai-extract"
import { guessCompanySite, linkedInTopcard } from "./company-hints"
import { decideContractAndRemote } from "./enrich"
import { decisionClient } from "@/server/settings/decisions"
import { tracedDecide } from "@/server/runs/decisions"

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

/** Short and small: used for many speculative domain checks in parallel. */
async function quickHtml(url: string) {
  const fetched = await safeFetch(url, { maxBytes: 1024 * 1024, accept: "text/html", timeoutMs: 5000 }).catch(() => null)
  if (!fetched || fetched.status >= 400 || !/html/i.test(fetched.contentType)) return null
  return { html: fetched.buffer.toString("utf8"), finalUrl: fetched.finalUrl }
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
    const { job, page, sources, errors } = url
      ? await run.step("fetch & parse", () => parseFromUrl(url, { fetchText: safeFetchText, renderPage: renderJobPage }), (value) => `${value.job.source} · confidence ${value.job.confidence}${value.errors.length ? ` · ${value.errors.length} source(s) failed` : ""}`)
      : await run.step("parse text", async () => ({ job: parsedJob.parse(parseJobDocument({ text: pasted })), page: null, sources: [] as { kind: string; html: string; finalUrl: string }[], errors: [] as string[] }), (value) => `confidence ${value.job.confidence}`)

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
    const parsedValues = { remote: job.remote, contract: job.employmentType }
    // AI pass: fills or corrects key fields when the rules were unsure. Values not
    // found verbatim in the posting are discarded, so the model cannot invent them.
    const needsAi = !url || job.confidence < 0.9 || !job.role || !job.company || !job.location
    const ai = needsAi && description.length >= 200 && (await getLlmOverview().catch(() => null))?.configured
      ? await run.step("AI read key fields", () => extractJobFields(description, completionForRun(run, "job fields", JOB_FIELDS_PROMPT_VERSION)), (value) => `${Object.keys(value.fields).length - 1} grounded field(s) · ${value.model}`).catch(() => null)
      : null
    if (ai) {
      const fill = (key: "role" | "company" | "location", hint: string) => {
        const value = ai.fields[key]
        if (!value) return
        // Structured board data (high confidence URL parse) wins over the model.
        if (job[key] && url && job.confidence >= 0.9) return
        if (job[key] !== value) hints[hint] = "AI (found in posting)"
        job[key] = value
      }
      fill("role", "title")
      fill("company", "company")
      fill("location", "location")
      if (!job.remote && ai.fields.remote) job.remote = ai.fields.remote
      if (!job.employmentType && ai.fields.employmentType) job.employmentType = ai.fields.employmentType
      if (!job.salary && ai.fields.salary) job.salary = ai.fields.salary
      if (!url && ai.fields.language) job.language = ai.fields.language
      job.warnings = job.warnings.filter((warning) => !(job.role && /role title was not detected/i.test(warning)) && !(job.company && /company was not detected/i.test(warning)))
    }
    // Contract and remote policy: calibrated decisions (Jev) when configured.
    if (!parsedValues.remote || !parsedValues.contract) {
      const decisions = await decisionClient().catch(() => null)
      if (decisions && description.length >= 200) {
        const decided = await run
          .step("decide contract & remote (decisions)", () => decideContractAndRemote(description, job.language, tracedDecide(run, decisions.decide, decisions.model), job.role), (value) => `${value.remote || "remote unknown"} (${Math.round(value.confidence.remote * 100)}%) · ${value.contract || "contract unknown"} (${Math.round(value.confidence.contract * 100)}%)`)
          .catch(() => null)
        // The posting's own structured value wins; otherwise the calibrated decision replaces any guess.
        if (decided?.remote && !parsedValues.remote) { job.remote = decided.remote; hints.remote = "decision model" }
        if (decided?.contract && !parsedValues.contract) { job.employmentType = decided.contract; hints.employmentType = "decision model" }
      }
    }
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

    const topcard = sources.map((source) => linkedInTopcard(source.html)).find((value) => value.logo || value.companyPage) ?? { companyPage: "", logo: "" }
    if (!site.url && job.company) {
      // The posting never links the site (LinkedIn, Indeed…): try likely domains, keep one whose page names the company.
      const guessed = await run.step("guess company site", () => guessCompanySite(job.company, job.location, quickHtml), (value) => value || "no verified match")
      if (guessed) Object.assign(site, { url: guessed, source: "domain guess (page names the company)", confidence: 0.7 })
    }

    let logo: { path: string; source: string } | null = known?.logoPath ? { path: known.logoPath, source: "known company" } : null
    if (!logo) {
      logo = await run.step(
        "find logo",
        async () => {
          const fromPosting = page ? postingLogoCandidates(page.html, page.finalUrl, { company: job.company, structuredLogo: job.companyLogo }) : job.companyLogo ? [{ url: job.companyLogo, source: "structured-data" }] : []
          const home = site.url ? await fetchHtml(site.url) : null
          const fromSite = home ? siteLogoCandidates(home.html, home.finalUrl) : []
          const fromTopcard = topcard.logo ? [{ url: topcard.logo, source: "LinkedIn company logo", priority: 96, strictShape: true }] : []
          return pickLogo([...fromTopcard, ...fromPosting.map((item) => ({ ...item, priority: Math.min("priority" in item ? item.priority : 92, 92), strictShape: false })), ...fromSite])
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
