import "server-only"
import { desc, eq, ne } from "drizzle-orm"
import { z } from "zod"
import { env } from "@/lib/env"
import { median, parseSalary, type SalaryRange } from "@/lib/salary"
import { titleSimilarity } from "@/lib/similar"
import { db } from "@/server/db/client"
import { companies, jobs, settings } from "@/server/db/schema"
import { decryptSecret, encryptSecret, encryptionReady } from "@/server/settings/encryption"
import { SettingsError } from "@/server/settings/errors"

/**
 * Pay context for a job, from three places:
 *   1. What the posting itself says.
 *   2. What other postings you saved for a similar role say (no network).
 *   3. Adzuna's market data for that title and place, with your own free key.
 * Levels.fyi and Glassdoor have no public API, so they are offered as links.
 */

const KEY = "integration.salaryData"
const stored = z.object({ provider: z.literal("adzuna"), appId: z.string(), encryptedKey: z.string() })
const CONTEXT = "salary:adzuna"

export async function salaryDataStatus() {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  const parsed = stored.safeParse(row?.value)
  return { configured: parsed.success, appId: parsed.data?.appId ?? null }
}

export async function saveSalaryData(input: { appId: string; appKey: string }) {
  if (!input.appId.trim() && !input.appKey.trim()) {
    await db.delete(settings).where(eq(settings.key, KEY))
    return
  }
  if (!encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key) so the key can be stored encrypted.")
  if (!input.appId.trim() || !input.appKey.trim()) throw new SettingsError("Paste both the Application ID and the Application key from developer.adzuna.com.")
  const value = { provider: "adzuna" as const, appId: input.appId.trim(), encryptedKey: encryptSecret(input.appKey.trim(), env.SETTINGS_ENCRYPTION_KEY, CONTEXT) }
  // Check the key works before keeping it.
  const probe = await fetch(`https://api.adzuna.com/v1/api/jobs/gb/search/1?results_per_page=1&what=developer&app_id=${encodeURIComponent(value.appId)}&app_key=${encodeURIComponent(input.appKey.trim())}`, { signal: AbortSignal.timeout(8000) })
  if (!probe.ok) throw new SettingsError(probe.status === 401 || probe.status === 403 ? "Adzuna didn’t accept this ID and key." : `Adzuna answered ${probe.status}. Try again in a moment.`)
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
}

/* ---------------------------------- market ---------------------------------- */

const COUNTRIES: Record<string, string[]> = {
  fr: ["france", "paris", "lyon", "marseille", "toulouse", "lille", "bordeaux", "nantes", "nice", "rennes", "strasbourg", "montpellier", "grenoble"],
  gb: ["united kingdom", "uk", "england", "london", "manchester", "edinburgh", "scotland", "bristol", "birmingham", "leeds", "cambridge"],
  de: ["germany", "deutschland", "berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart"],
  nl: ["netherlands", "amsterdam", "rotterdam", "utrecht", "eindhoven", "the hague"],
  be: ["belgium", "belgique", "brussels", "bruxelles", "antwerp", "ghent"],
  ch: ["switzerland", "suisse", "zurich", "zürich", "geneva", "genève", "lausanne", "basel"],
  es: ["spain", "españa", "madrid", "barcelona", "valencia"],
  it: ["italy", "italia", "milan", "milano", "rome", "roma", "turin"],
  at: ["austria", "vienna", "wien"],
  pl: ["poland", "warsaw", "kraków", "krakow", "wrocław"],
  ca: ["canada", "toronto", "montreal", "montréal", "vancouver", "ottawa"],
  au: ["australia", "sydney", "melbourne", "brisbane"],
  us: ["united states", "usa", "new york", "san francisco", "seattle", "boston", "austin", "chicago", "los angeles", "remote us"],
  in: ["india", "bangalore", "bengaluru", "mumbai", "delhi", "hyderabad", "pune"],
  sg: ["singapore"],
}
const CURRENCY: Record<string, string> = { fr: "EUR", de: "EUR", nl: "EUR", be: "EUR", es: "EUR", it: "EUR", at: "EUR", gb: "GBP", ch: "CHF", pl: "PLN", ca: "CAD", au: "AUD", us: "USD", in: "INR", sg: "SGD" }

export function countryFor(location: string, language: string): string | null {
  const text = location.toLowerCase()
  for (const [code, words] of Object.entries(COUNTRIES)) if (words.some((word) => text.includes(word))) return code
  return language === "fr" ? "fr" : language === "de" ? "de" : null
}

const cityOf = (location: string) => location.split(/[,(·|–-]/)[0].trim()

type Market = { median: number; low: number; high: number; samples: number; currency: string; where: string; country: string; url: string }

async function adzuna(title: string, location: string, language: string): Promise<Market | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY))
  const parsed = stored.safeParse(row?.value)
  const country = countryFor(location, language)
  if (!parsed.success || !country) return null
  const appKey = decryptSecret(parsed.data.encryptedKey, env.SETTINGS_ENCRYPTION_KEY, CONTEXT)
  const what = title.replace(/\(.*?\)|[-–|/].*$/g, "").replace(/\b(h\/f|f\/h|m\/w\/d|m\/f)\b/gi, "").trim().slice(0, 80)
  const attempt = async (where: string) => {
    const params = new URLSearchParams({ app_id: parsed.data.appId, app_key: appKey, what })
    if (where) params.set("where", where)
    const response = await fetch(`https://api.adzuna.com/v1/api/jobs/${country}/histogram?${params}`, { signal: AbortSignal.timeout(8000), next: { revalidate: 60 * 60 * 24 * 7 } })
    if (!response.ok) return null
    const data = (await response.json()) as { histogram?: Record<string, number> }
    return Object.entries(data.histogram ?? {}).map(([bucket, count]) => [Number(bucket), count] as const).filter(([bucket, count]) => bucket > 0 && count > 0)
  }
  const city = cityOf(location)
  let where = city && !/remote|télétravail|anywhere/i.test(city) ? city : ""
  let buckets = await attempt(where)
  if (!buckets || buckets.reduce((sum, [, count]) => sum + count, 0) < 10) {
    where = ""
    buckets = await attempt("")
  }
  if (!buckets?.length) return null
  // Expand buckets to a weighted list (bucket lower bound + half a step) to read percentiles.
  const step = buckets.length > 1 ? buckets[1][0] - buckets[0][0] : 10000
  const total = buckets.reduce((sum, [, count]) => sum + count, 0)
  if (total < 5) return null
  const percentile = (p: number) => {
    let seen = 0
    for (const [bucket, count] of buckets!) {
      seen += count
      if (seen >= total * p) return Math.round(bucket + step / 2)
    }
    return buckets!.at(-1)![0]
  }
  const params = new URLSearchParams({ q: what, ...(where ? { w: where } : {}) })
  return { median: percentile(0.5), low: percentile(0.25), high: percentile(0.75), samples: total, currency: CURRENCY[country] ?? "EUR", where: where || country.toUpperCase(), country, url: `https://www.adzuna.${country === "gb" ? "co.uk" : country === "us" ? "com" : country}/search?${params}` }
}

/* ------------------------------ your own postings ------------------------------ */

async function similarPostings(jobId: string, title: string, currency: string | null) {
  const rows = await db
    .select({ id: jobs.id, title: jobs.title, salary: jobs.salary, company: companies.name })
    .from(jobs)
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(ne(jobs.id, jobId))
    .orderBy(desc(jobs.createdAt))
    .limit(500)
  return rows
    .filter((row) => row.salary && titleSimilarity(row.title, title) >= 0.5)
    .map((row) => ({ ...row, range: parseSalary(row.salary) }))
    .filter((row): row is typeof row & { range: SalaryRange } => Boolean(row.range) && (!currency || !row.range!.currency || row.range!.currency === currency))
    .slice(0, 12)
}

/* ---------------------------------- public ---------------------------------- */

export type SalaryContext = {
  posting: SalaryRange | null
  postingText: string
  peers: { median: number; count: number; currency: string | null; items: { id: string; title: string; company: string | null; min: number; max: number }[] } | null
  market: Market | null
  marketAvailable: boolean
  links: { label: string; url: string }[]
}

export async function salaryContext(job: { id: string; title: string; location: string; salary: string; language: string; company?: { name: string } | null }): Promise<SalaryContext> {
  const posting = parseSalary(job.salary)
  const [peerRows, market, status] = await Promise.all([
    similarPostings(job.id, job.title, posting?.currency ?? null),
    adzuna(job.title, job.location, job.language).catch(() => null),
    salaryDataStatus(),
  ])
  const mids = peerRows.map((row) => Math.round((row.range.yearlyMin + row.range.yearlyMax) / 2))
  const peers = peerRows.length
    ? { median: median(mids)!, count: peerRows.length, currency: posting?.currency ?? peerRows[0].range.currency, items: peerRows.map((row) => ({ id: row.id, title: row.title, company: row.company, min: row.range.yearlyMin, max: row.range.yearlyMax })) }
    : null
  const role = encodeURIComponent(job.title.replace(/\(.*?\)/g, "").trim())
  const company = job.company?.name
  const links = [
    { label: "Levels.fyi", url: company ? `https://www.levels.fyi/companies/${encodeURIComponent(company.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}/salaries` : `https://www.levels.fyi/t/${role}` },
    { label: "Glassdoor", url: `https://www.glassdoor.com/Search/results.htm?keyword=${encodeURIComponent(`${company ?? ""} ${job.title}`.trim())}` },
  ]
  if (countryFor(job.location, job.language) === "fr") links.push({ label: "APEC", url: `https://www.apec.fr/candidat/recherche-emploi.html/emploi?motsCles=${role}` })
  return { posting, postingText: job.salary, peers, market, marketAvailable: status.configured, links }
}
