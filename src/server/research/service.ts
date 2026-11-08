import "server-only"
import { eq } from "drizzle-orm"
import { safeFetchText } from "@/server/assets/safe-fetch"
import { db } from "@/server/db/client"
import { companies, jobs } from "@/server/db/schema"
import { registrableDomain } from "@/server/jobs/vendor/company-resolver"
import { startRun } from "@/server/runs/tracer"
import { buildBrief, type CompanyResearch } from "./brief"
import { extractCompanyPage, type PageFacts } from "./extract"
import { robotsAllows } from "./robots"
import { ANGLES_PROMPT_VERSION, companyAngles } from "./ai-angles"
import { completionForRun } from "@/server/llm/client"
import { getLlmOverview } from "@/server/settings/llm"
import { summarizeCompany, SUMMARY_PROMPT_VERSION } from "./company-summary"
import { companyRedirectAllowed } from "./site-domain"
import { companyFactsEnabled, companyProfile } from "@/server/companies/profile"
import { publicResearchSources } from "./public-sources"

const MAX_PAGES = 6
const CACHE_DAYS = 7
const CONVENTIONAL = ["/about", "/about-us", "/company", "/our-story", "/mission", "/values", "/careers", "/a-propos", "/qui-sommes-nous", "/fr/a-propos", "/en/about", "/sobre-nosotros", "/ueber-uns"]
// Whole path segments only ("deal-submission" is not "mission").
const INTERESTING = /(?:^|\/)(?:about(?:-us)?|mission|values|our-story|story|company|who-we-are|products?|solutions?|services?|platform|industries|what-we-do|produits|nos-offres|nos-solutions|careers|jobs|a-propos|qui-sommes-nous|valeurs|sobre-nosotros|ueber-uns|über-uns)(?:\/|$)/i

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** Links on the homepage that point to about/mission/values pages of the same site. */
function discoverLinks(html: string, base: string) {
  const domain = registrableDomain(hostOf(base))
  const out: string[] = []
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], base)
      if (!/^https?:$/.test(url.protocol) || registrableDomain(url.hostname.replace(/^www\./, "")) !== domain) continue
      if (!INTERESTING.test(url.pathname) || /\.(pdf|jpg|png|zip)$/i.test(url.pathname)) continue
      url.search = ""
      if (!out.includes(url.toString())) out.push(url.toString())
    } catch {
      // ignore malformed links
    }
  }
  return out
}

/**
 * Read up to MAX_PAGES pages of a company's own site (home, then about/mission/
 * values/careers links it exposes, then conventional paths). A same-brand
 * homepage redirect selects the canonical domain; subsequent pages stay there.
 * robots.txt is respected and every request remains SSRF-safe.
 */
export async function readCompanySite(website: string): Promise<{ pages: PageFacts[]; blockedStatus: number | null; rejectedRedirect: string | null }> {
  const pages: PageFacts[] = []
  let blockedStatus: number | null = null
  let rejectedRedirect: string | null = null
  let origin = new URL(website).origin
  const robotsResponse = await safeFetchText(`${origin}/robots.txt`, 200_000).catch(() => null)
  let robots = robotsResponse && robotsResponse.status < 400 ? robotsResponse.text : ""
  let domain = registrableDomain(hostOf(origin))
  const fetchPage = async (url: string, homepage = false) => {
    const path = new URL(url).pathname || "/"
    if (!robotsAllows(robots, path)) return null
    const response = await safeFetchText(url, 2 * 1024 * 1024).catch(() => null)
    if (response && homepage && (response.status === 403 || response.status === 429)) blockedStatus = response.status
    if (!response || response.status >= 400 || !/html/i.test(response.contentType)) return null
    if (registrableDomain(hostOf(response.finalUrl)) !== domain) {
      if (!homepage || !companyRedirectAllowed(origin, response.finalUrl)) {
        rejectedRedirect = hostOf(response.finalUrl)
        return null
      }
      origin = new URL(response.finalUrl).origin
      domain = registrableDomain(hostOf(origin))
      const canonicalRobots = await safeFetchText(`${origin}/robots.txt`, 200_000).catch(() => null)
      robots = canonicalRobots && canonicalRobots.status < 400 ? canonicalRobots.text : ""
    }
    if (!robotsAllows(robots, new URL(response.finalUrl).pathname || "/")) return null
    const facts = extractCompanyPage(response.text, response.finalUrl)
    return facts ? { html: response.text, url: response.finalUrl, facts } : null
  }
  const home = await fetchPage(origin, true)
  if (home) pages.push(home.facts)
  const candidates = [...(home ? discoverLinks(home.html, home.url) : []), ...CONVENTIONAL.map((path) => `${origin}${path}`)]
  const visited = new Set(pages.map((page) => page.url.replace(/\/$/, "")))
  for (const url of candidates) {
    if (pages.length >= MAX_PAGES) break
    const key = url.replace(/\/$/, "")
    if (visited.has(key)) continue
    visited.add(key)
    const page = await fetchPage(url)
    if (!page) continue
    const finalKey = page.url.replace(/\/$/, "")
    if (finalKey !== key && visited.has(finalKey)) continue
    visited.add(finalKey)
    pages.push(page.facts)
  }
  return { pages, blockedStatus, rejectedRedirect }
}

export async function researchForJob(jobId: string, options: { force?: boolean; language?: string } = {}): Promise<CompanyResearch | null> {
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId), with: { company: true } })
  if (!job?.company) return null
  return researchCompany(job.company, options, job)
}

/** Company research needs only the company's own website, never a job or application. */
export async function researchForCompany(companyId: string, options: { force?: boolean; language?: string } = {}): Promise<CompanyResearch | null> {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) })
  return company ? researchCompany(company, options) : null
}

async function researchCompany(company: typeof companies.$inferSelect, options: { force?: boolean; language?: string }, job?: Pick<typeof jobs.$inferSelect, "rawText" | "language" | "sourceUrl">): Promise<CompanyResearch> {
  if (!job && !company.website) throw new Error("Add the company’s website to start research.")
  const language = options.language ?? job?.language ?? "en"
  const fresh = company.researchedAt && Date.now() - company.researchedAt.getTime() < CACHE_DAYS * 86_400_000
  if (fresh && !options.force && company.research) return company.research as unknown as CompanyResearch
  const aiConfigured = (await getLlmOverview().catch(() => null))?.configured
  if (!job && !aiConfigured) throw new Error("Configure an AI model in Settings to generate a company overview.")

  const run = await startRun("company.research", { companyId: company.id, website: company.website })
  try {
    const pages: PageFacts[] = []
    const notes: string[] = []
    if (!company.website) notes.push("Add the company’s website for a richer brief.")
    const enrich = run.step("read public company sources", async () => {
      if (!(await companyFactsEnabled())) return { pages: [] as PageFacts[], notes: [] as string[] }
      return publicResearchSources(await companyProfile(company))
    }, (value) => `${value.pages.length} verified public source(s)`).catch(() => ({ pages: [] as PageFacts[], notes: ["Public company sources couldn’t be reached. Research uses the available website pages."] }))
    if (company.website) {
      const site = await run.step("read company site", () => readCompanySite(company.website!), (value) => `${value.pages.length} page(s)${value.blockedStatus ? ` · blocked ${value.blockedStatus}` : ""}`)
      pages.push(...site.pages)
      if (site.blockedStatus) notes.push(`${company.name}’s website blocked automated reading (HTTP ${site.blockedStatus}). Research uses other available sources.`)
      if (!site.pages.length && site.rejectedRedirect) notes.push(`The website redirects to ${site.rejectedRedirect}, which couldn’t be confirmed as the company’s own site. Update its website address and retry.`)
    }
    const publicSources = await enrich
    pages.push(...publicSources.pages)
    notes.push(...publicSources.notes)
    // A failed refresh must not replace existing research with an empty brief.
    if (!job && !pages.length) throw new Error(notes[0] || "Couldn’t read the company’s website. Check the website address or try again later.")
    const brief = buildBrief({ company: company.name, website: company.website ?? "", pages, jobText: job?.rawText ?? "", language, notes })
    if (aiConfigured && pages.length) {
      try {
        const result = await run.step("AI company overview", () => summarizeCompany({ company: company.name, language, pages }, completionForRun(run, "company overview", SUMMARY_PROMPT_VERSION)), (value) => `${value.summary.sources.length} cited source(s)`)
        brief.summary = result.summary
        brief.summaryModel = result.model
      } catch (error) {
        if (!job) throw error
        notes.push("The AI overview couldn’t be generated. Refresh research to try again.")
      }
    }
    if (job && aiConfigured) {
      const ai = await run
        .step("AI company angles", () => companyAngles({ company: company.name, language, pages, jobText: job.rawText, jobUrl: job.sourceUrl ?? "" }, completionForRun(run, "company angles", ANGLES_PROMPT_VERSION)), (value) => `${value.angles.length} cited angle(s)`)
        .catch(() => null)
      if (ai?.angles.length) {
        brief.angles = ai.angles
        brief.anglesModel = ai.model
      }
    }
    await db.update(companies).set({ research: brief as unknown as Record<string, unknown>, researchedAt: new Date() }).where(eq(companies.id, company.id))
    await run.finish("succeeded", { pages: pages.length, mission: brief.mission.length, values: brief.values.length })
    return brief
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}
