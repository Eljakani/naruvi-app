import "server-only"
import { eq } from "drizzle-orm"
import { safeFetchText } from "@/server/assets/safe-fetch"
import { db } from "@/server/db/client"
import { companies, jobs } from "@/server/db/schema"
import { registrableDomain } from "@/server/jobs/vendor/company-resolver"
import { startRun } from "@/server/runs/tracer"
import { buildBrief, type CompanyResearch } from "./brief"
import { extractPage, type PageFacts } from "./extract"
import { robotsAllows } from "./robots"

const MAX_PAGES = 6
const CACHE_DAYS = 7
const CONVENTIONAL = ["/about", "/about-us", "/company", "/our-story", "/mission", "/values", "/careers", "/a-propos", "/qui-sommes-nous", "/fr/a-propos", "/en/about", "/sobre-nosotros", "/ueber-uns"]
// Whole path segments only ("deal-submission" is not "mission").
const INTERESTING = /(?:^|\/)(?:about(?:-us)?|mission|values|our-story|story|company|who-we-are|careers|jobs|a-propos|qui-sommes-nous|valeurs|sobre-nosotros|ueber-uns|über-uns)(?:\/|$)/i

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
 * values/careers links it exposes, then conventional paths). Same registrable
 * domain only, robots.txt respected, SSRF-safe fetches.
 */
export async function readCompanySite(website: string): Promise<{ pages: PageFacts[]; blockedStatus: number | null }> {
  const pages: PageFacts[] = []
  let blockedStatus: number | null = null
  const origin = new URL(website).origin
  const robotsResponse = await safeFetchText(`${origin}/robots.txt`, 200_000).catch(() => null)
  const robots = robotsResponse && robotsResponse.status < 400 ? robotsResponse.text : ""
  const domain = registrableDomain(hostOf(origin))
  const fetchPage = async (url: string) => {
    const path = new URL(url).pathname || "/"
    if (!robotsAllows(robots, path)) return null
    const response = await safeFetchText(url, 2 * 1024 * 1024).catch(() => null)
    if (response && url === origin && (response.status === 403 || response.status === 429)) blockedStatus = response.status
    if (!response || response.status >= 400 || !/html/i.test(response.contentType)) return null
    // Redirected to another site (a parked domain, a job board): not the company's own words.
    if (registrableDomain(hostOf(response.finalUrl)) !== domain) return null
    return { html: response.text, url: response.finalUrl }
  }
  const home = await fetchPage(origin)
  if (home) pages.push(extractPage(home.html, home.url))
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
    pages.push(extractPage(page.html, page.url))
  }
  return { pages, blockedStatus }
}

export async function researchForJob(jobId: string, options: { force?: boolean; language?: string } = {}): Promise<CompanyResearch | null> {
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId), with: { company: true } })
  if (!job?.company) return null
  const company = job.company
  const fresh = company.researchedAt && Date.now() - company.researchedAt.getTime() < CACHE_DAYS * 86_400_000
  if (fresh && !options.force && company.research) return company.research as unknown as CompanyResearch

  const run = await startRun("company.research", { companyId: company.id, website: company.website })
  try {
    const pages: PageFacts[] = []
    const notes: string[] = []
    if (!company.website) notes.push("No company website on this job — add it on the job page for a richer brief.")
    if (company.website) {
      const site = await run.step("read company site", () => readCompanySite(company.website!), (value) => `${value.pages.length} page(s)${value.blockedStatus ? ` · blocked ${value.blockedStatus}` : ""}`)
      pages.push(...site.pages)
      if (site.blockedStatus) notes.push(`${company.name}’s website blocked automated reading (HTTP ${site.blockedStatus}). The brief uses the job posting only — have a look at their site yourself.`)
    }
    const brief = buildBrief({ company: company.name, website: company.website ?? "", pages, jobText: job.rawText, language: options.language ?? job.language, notes })
    await db.update(companies).set({ research: brief as unknown as Record<string, unknown>, researchedAt: new Date() }).where(eq(companies.id, company.id))
    await run.finish("succeeded", { pages: pages.length, mission: brief.mission.length, values: brief.values.length })
    return brief
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}
