import "server-only"
import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"
import { DISCOVERED, DISCOVER_ACTORS, DISCOVER_BOARDS, discoverSearches, skillMatches, titleFits, type DiscoverBoard } from "@/lib/discover"
import { env } from "@/lib/env"
import { contractOf } from "@/lib/job-program"
import { goalFit } from "@/lib/search-goals"
import { db } from "@/server/db/client"
import { entries, settings } from "@/server/db/schema"
import { getProfile } from "@/server/profile/repository"
import { decryptSecret, encryptionReady, encryptSecret } from "@/server/settings/encryption"
import { SettingsError } from "@/server/settings/errors"
import { addLeads } from "./leads"
import { pickLogo, slugify } from "./ingest"
import { companies } from "@/server/db/schema"
import { inArray } from "drizzle-orm"

const APIFY_KEY = "integration.apify"
const PER_SEARCH = 25
/** The best matches of one run; the rest would only bury them. */
const KEEP = 30
const DAY_MS = 24 * 60 * 60 * 1000
const BOARDS = Object.keys(DISCOVER_BOARDS) as [DiscoverBoard, ...DiscoverBoard[]]
const stored = z.object({
  encryptedToken: z.string(),
  boards: z.array(z.enum(BOARDS)).default(["linkedin"]),
  daily: z.boolean().default(false),
  lastRunAt: z.string().nullable().default(null),
})
const input = z.object({
  token: z.string().trim().max(200).default(""),
  boards: z.array(z.enum(BOARDS)).min(1, "Choose at least one job board."),
  daily: z.boolean().default(false),
})

const BAD_TOKEN = "Apify didn’t accept your token. Paste a new one on the Integrations page."
/** Apify answers errors as { error: { message } }; show the sentence, not the JSON. */
async function apifyError(response: Response) {
  const text = (await response.text()).slice(0, 300)
  try {
    return String((JSON.parse(text) as { error?: { message?: unknown } }).error?.message ?? text)
  } catch {
    return text
  }
}

async function read() {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, APIFY_KEY) })
  const value = stored.safeParse(row?.value)
  return value.success ? value.data : null
}
const write = (value: z.infer<typeof stored>) => db.insert(settings).values({ key: APIFY_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })

/** Safe DTO: never includes the token. */
export async function apifyStatus() {
  const [value, profile] = await Promise.all([read(), getProfile()])
  /** What a run searches for (from the active search goals), so the card can show it. */
  const searches = profile ? discoverSearches(profile).map((search) => (search.location ? `${search.keywords} · ${search.location}` : search.keywords)) : []
  return { configured: Boolean(value), boards: value?.boards ?? ["linkedin" as const], daily: value?.daily ?? false, lastRunAt: value?.lastRunAt ?? null, searches }
}
export type ApifyStatus = Awaited<ReturnType<typeof apifyStatus>>

/** An empty token keeps the saved one. */
export async function saveApify(raw: unknown, fetcher: typeof fetch = fetch) {
  const value = input.parse(raw)
  const previous = await read()
  if (!value.token && !previous) throw new SettingsError("Enter your Apify API token.")
  if (value.token && !encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key).")
  // A wrong token is caught now, not after a search that waits and fails. Apify being unreachable doesn't block saving.
  if (value.token) {
    const check = await fetcher("https://api.apify.com/v2/users/me", { headers: { Authorization: `Bearer ${value.token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null)
    if (check?.status === 401) throw new SettingsError("Apify didn’t accept this token. Copy it again from Apify Console › Settings › API & Integrations.")
  }
  await write({ encryptedToken: value.token ? encryptSecret(value.token, env.SETTINGS_ENCRYPTION_KEY, "apify") : previous!.encryptedToken, boards: value.boards, daily: value.daily, lastRunAt: previous?.lastRunAt ?? null })
}

/** The saved Apify token, for other Apify searches (people at a company). */
export async function apifyToken() {
  const config = await read()
  if (!config) throw new SettingsError("Add an Apify token on the Integrations page first.")
  return decryptSecret(config.encryptedToken, env.SETTINGS_ENCRYPTION_KEY, "apify")
}

export async function removeApify() {
  await db.delete(settings).where(eq(settings.key, APIFY_KEY))
}

/** Every skill on the profile, for ranking leads. */
export async function profileSkills() {
  const profile = await getProfile()
  if (!profile) return []
  const rows = await db.select({ skills: entries.skills }).from(entries).where(and(eq(entries.profileId, profile.id), ne(entries.status, "archived")))
  return [...new Set(rows.flatMap((row) => row.skills))]
}

/**
 * Search the chosen job boards for postings that match the profile (Apify,
 * your own token). Postings your search goals rule out are dropped, the rest
 * are ranked by the profile skills they name, and the best land in the job
 * leads. Nothing becomes a job until you import it.
 */
export async function discoverJobs(fetcher: typeof fetch = fetch) {
  const config = await read()
  if (!config) throw new SettingsError("Add an Apify token on the Integrations page first.")
  const token = decryptSecret(config.encryptedToken, env.SETTINGS_ENCRYPTION_KEY, "apify")
  const profile = await getProfile()
  const searches = profile ? discoverSearches(profile) : []
  if (!profile || !searches.length) throw new SettingsError("Add the roles you’re looking for to an active search goal (Profile › Search goals) first: discovery only searches for what your goals ask for.")
  await write({ ...config, lastRunAt: new Date().toISOString() })
  const runs = config.boards.flatMap((board) => searches.map((search) => ({ source: DISCOVER_ACTORS[board], body: DISCOVER_ACTORS[board].input(search, PER_SEARCH) }))).filter((run) => run.body)
  const results = await Promise.allSettled(
    runs.map(async ({ source, body }) => {
      const response = await fetcher(`https://api.apify.com/v2/acts/${source.actor}/run-sync-get-dataset-items?clean=true`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300_000),
      })
      if (response.status === 401) throw new SettingsError(BAD_TOKEN)
      if (!response.ok) throw new Error(`Apify (${response.status}): ${await apifyError(response)}`)
      const items: unknown = await response.json()
      return (Array.isArray(items) ? items : []).flatMap((item) => (item && typeof item === "object" ? (source.lead(item as Record<string, unknown>) ?? []) : []))
    }),
  )
  const failed = results.filter((result) => result.status === "rejected")
  // One broken board must not hide what the others found.
  if (failed.length === results.length) throw new SettingsError(failed[0]?.reason instanceof Error ? failed[0].reason.message : "No job board could be searched.")
  const found = [...new Map(results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])).map((lead) => [lead.url, lead])).values()]
  const keywords = [...new Set(searches.map((search) => search.keywords))]
  // Boards pad results with loosely related postings: keep the ones whose title is about a keyword, that your goals allow.
  const wanted = found.filter((lead) => titleFits(lead.title, keywords) && goalFit(profile.goals, { location: lead.location, remote: "", insights: { contract: contractOf(`${lead.title} ${lead.contract}`) } })?.verdict !== "blocked")
  const skills = await profileSkills()
  const kept = wanted.map((lead) => ({ lead, score: skillMatches(lead.text, skills).length })).sort((a, b) => b.score - a.score).slice(0, KEEP).map(({ lead }) => lead)
  const logos = await leadLogos(kept)
  const best = kept.map((lead) => ({ url: lead.url, title: lead.title, board: lead.board, text: lead.text, company: lead.company, location: lead.location, logoPath: logos.get(lead.company) ?? null }))
  const where = keywords.join(", ")
  return { found: found.length, added: await addLeads(best, `${DISCOVERED}: ${where}`, new Date()), failed: failed.length }
}

/** Each company's logo: the one already saved for a known company, else a quick download of the board's (stored once, by content). */
async function leadLogos(leads: { company: string; logo: string }[]) {
  const byCompany = new Map(leads.filter((lead) => lead.company).map((lead) => [lead.company, lead.logo]))
  const known = byCompany.size ? await db.select({ slug: companies.slug, logoPath: companies.logoPath }).from(companies).where(inArray(companies.slug, [...byCompany.keys()].map(slugify))) : []
  const saved = new Map(known.filter((row) => row.logoPath).map((row) => [row.slug, row.logoPath!]))
  const found = await Promise.all(
    [...byCompany].map(async ([company, url]) => [company, saved.get(slugify(company)) ?? (url ? ((await pickLogo([{ url, source: "job board" }], true, 4000).catch(() => null))?.path ?? null) : null)] as const),
  )
  return new Map(found.filter((entry): entry is readonly [string, string] => Boolean(entry[1])))
}

/** Saved logos of known companies, for lead titles ("Role · Company"), keyed by title. */
export async function leadCompanyLogos(titles: string[]) {
  const company = (title: string) => (title.includes(" · ") ? title.slice(title.lastIndexOf(" · ") + 3) : "")
  const slugs = [...new Set(titles.map(company).filter(Boolean).map(slugify))]
  if (!slugs.length) return new Map<string, string>()
  const rows = await db.select({ slug: companies.slug, logoPath: companies.logoPath }).from(companies).where(inArray(companies.slug, slugs))
  const bySlug = new Map(rows.filter((row) => row.logoPath).map((row) => [row.slug, row.logoPath!]))
  return new Map(titles.flatMap((title) => { const path = company(title) && bySlug.get(slugify(company(title))); return path ? [[title, path] as const] : [] }))
}

/** Background: once a day, when you turned it on. */
export async function discoverIfDue() {
  const config = await read()
  if (!config?.daily || (config.lastRunAt && Date.now() - Date.parse(config.lastRunAt) < DAY_MS)) return
  await discoverJobs()
}
