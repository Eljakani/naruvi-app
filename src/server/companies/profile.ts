import "server-only"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/server/db/client"
import { companies, settings } from "@/server/db/schema"

/**
 * Public facts about a company — size, founding year, headquarters,
 * industry — from free, open sources that need no key:
 *   • Wikidata (worldwide, community-maintained)
 *   • Recherche d'entreprises (French government business registry)
 * Only the company's name and website are sent. A result is kept only when it
 * clearly matches: the same website, or the exact same name.
 */

export type ProfileFact = { label: string; value: string; source: "wikidata" | "registry" }
export type CompanyProfile = {
  description: string | null
  facts: ProfileFact[]
  links: { label: string; url: string }[]
  sources: { name: string; url: string }[]
  /** How sure the match is: the website matched, or only the name did. */
  match: "website" | "name" | null
  fetchedAt: string
}

const SETTING_KEY = "integration.companyFacts"
const TIMEOUT = 6000
const UA = "Naruvi/0.1 (self-hosted job search assistant)"

export async function companyFactsEnabled(): Promise<boolean> {
  const [row] = await db.select().from(settings).where(eq(settings.key, SETTING_KEY))
  return z.object({ enabled: z.boolean() }).safeParse(row?.value).data?.enabled ?? true
}

export async function setCompanyFactsEnabled(enabled: boolean) {
  await db.insert(settings).values({ key: SETTING_KEY, value: { enabled } }).onConflictDoUpdate({ target: settings.key, set: { value: { enabled }, updatedAt: new Date() } })
}

/**
 * Wikimedia's APIs (Wikidata, Wikipedia) allow anonymous clients about ten
 * calls in a rolling window of some twenty seconds, then refuse for a while.
 * Calls are spaced, kept under that budget (waiting when it is spent), and a
 * refusal is retried after the delay the server asks for.
 */
const WIKIMEDIA = /(^|\.)(wikidata|wikipedia)\.org$/
const BUDGET = { calls: 7, windowMs: 26_000, spacingMs: 300 }
const recent: number[] = []
/** Set when the server refuses: every call waits it out, not only the one refused. */
let blockedUntil = 0
let gate: Promise<void> = Promise.resolve()
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
function wikimediaTurn(): Promise<void> {
  const turn = gate.then(async () => {
    if (blockedUntil > Date.now()) await pause(blockedUntil - Date.now())
    const now = Date.now()
    while (recent.length && now - recent[0] > BUDGET.windowMs) recent.shift()
    if (recent.length >= BUDGET.calls) await pause(recent[0] + BUDGET.windowMs - now)
    recent.push(Date.now())
    if (recent.length > BUDGET.calls) recent.shift()
  })
  gate = turn.then(() => pause(BUDGET.spacingMs), () => undefined)
  return turn
}

export async function getJson(url: string): Promise<unknown> {
  const wikimedia = WIKIMEDIA.test(new URL(url).hostname) && new URL(url).pathname.startsWith("/w/")
  for (let attempt = 0; ; attempt += 1) {
    if (wikimedia) await wikimediaTurn()
    const response = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" })
    const wait = Number(response.headers.get("retry-after")) * 1000 || 2000 * (attempt + 1)
    if (response.status === 429 && attempt < 3 && wait <= 20_000) {
      blockedUntil = Math.max(blockedUntil, Date.now() + wait)
      await pause(wait)
      continue
    }
    if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`)
    return response.json()
  }
}

/**
 * One Wikidata item from its own data page. Those pages are served from
 * cache and do not count against the API's budget, so details are read here
 * and the API is kept for searching.
 */
export async function entityData(id: string): Promise<Entity | null> {
  if (!/^Q\d+$/.test(id)) return null
  const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" })
  if (!response.ok) throw new Error(`wikidata.org answered ${response.status}`)
  const data = (await response.json()) as { entities?: Record<string, Entity> }
  // A redirected item comes back under its new id.
  return data.entities?.[id] ?? Object.values(data.entities ?? {})[0] ?? null
}

export const normalize = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\b(inc|ltd|llc|gmbh|sa|sas|sasu|sarl|plc|corp|corporation|company|co|group|groupe|ag|bv|nv|se)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "")

const bareHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/* ---------------------------------- Wikidata ---------------------------------- */

export type Entity = { id: string; labels?: Record<string, { value: string }>; descriptions?: Record<string, { value: string }>; aliases?: Record<string, { value: string }[]>; claims?: Record<string, Claim[]>; sitelinks?: Record<string, { title: string }> }
type Claim = { mainsnak?: { datavalue?: { value?: unknown } } }
export const values = (entity: Entity, property: string) => (entity.claims?.[property] ?? []).map((claim) => claim.mainsnak?.datavalue?.value).filter((value) => value !== undefined)
export const label = (entity: Entity | undefined) => entity?.labels?.en?.value ?? entity?.labels?.fr?.value ?? Object.values(entity?.labels ?? {})[0]?.value

export async function entities(ids: string[]): Promise<Record<string, Entity>> {
  if (!ids.length) return {}
  const wanted = ids.slice(0, 50)
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|descriptions|aliases|claims|sitelinks&languages=en|fr&sitefilter=enwiki|frwiki&ids=${wanted.join("|")}`
  try {
    const data = (await getJson(url)) as { entities?: Record<string, Entity> }
    return data.entities ?? {}
  } catch {
    // The API is refusing: read each item's own data page instead.
    const pages = await Promise.allSettled(wanted.slice(0, 12).map(async (id) => [id, await entityData(id)] as const))
    const found = pages.flatMap((page) => (page.status === "fulfilled" && page.value[1] ? [[page.value[0], page.value[1]] as const] : []))
    if (!found.length) throw new Error("www.wikidata.org is not answering")
    return Object.fromEntries(found)
  }
}

async function fromWikidata(name: string, website: string | null): Promise<Omit<CompanyProfile, "fetchedAt" | "sources"> & { url: string } | null> {
  const search = (await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=7&language=en&search=${encodeURIComponent(name)}`)) as { search?: { id: string }[] }
  const candidates = await entities((search.search ?? []).map((item) => item.id))
  const host = website ? bareHost(website) : null
  let match: "website" | "name" | null = null
  let entity: Entity | undefined
  for (const candidate of Object.values(candidates)) {
    const sites = values(candidate, "P856").map((value) => bareHost(String(value))).filter(Boolean)
    if (host && sites.some((site) => site === host || site!.endsWith(`.${host}`) || host.endsWith(`.${site}`))) {
      entity = candidate
      match = "website"
      break
    }
  }
  if (!entity && !host) {
    // No website to check against: accept only an exact name with company-like facts.
    const called = (candidate: Entity) => [label(candidate) ?? "", ...Object.values(candidate.aliases ?? {}).flatMap((list) => list.map((item) => item.value))].some((item) => normalize(item) === normalize(name))
    entity = Object.values(candidates).find((candidate) => called(candidate) && (values(candidate, "P1128").length || values(candidate, "P452").length || values(candidate, "P856").length))
    if (entity) match = "name"
  }
  if (!entity) return null

  const amount = (property: string) => {
    const value = values(entity!, property).at(-1) as { amount?: string } | undefined
    return value?.amount ? Number(value.amount.replace("+", "")) : null
  }
  const item = (property: string) => values(entity!, property).map((value) => (value as { id?: string }).id).filter(Boolean) as string[]
  const time = (property: string) => (values(entity!, property)[0] as { time?: string } | undefined)?.time?.match(/^\+?(\d{4})/)?.[1] ?? null
  const linked = await entities([...item("P159"), ...item("P452"), ...item("P749"), ...item("P17")].slice(0, 20))
  const names = (ids: string[]) => ids.map((id) => label(linked[id])).filter(Boolean).slice(0, 2).join(", ")

  const facts: ProfileFact[] = []
  const add = (labelText: string, value: string | null | undefined) => {
    if (value) facts.push({ label: labelText, value, source: "wikidata" })
  }
  const employees = amount("P1128")
  add("Employees", employees ? new Intl.NumberFormat("en").format(employees) : null)
  add("Founded", time("P571"))
  add("Headquarters", names(item("P159")) || names(item("P17")))
  add("Industry", names(item("P452")))
  add("Parent", names(item("P749")))
  const ticker = values(entity, "P249")[0]
  add("Ticker", ticker ? String(ticker) : null)

  const links: { label: string; url: string }[] = []
  const linkedin = values(entity, "P4264")[0]
  if (linkedin) links.push({ label: "LinkedIn", url: `https://www.linkedin.com/company/${linkedin}` })
  const wiki = entity.sitelinks?.enwiki?.title ?? entity.sitelinks?.frwiki?.title
  if (wiki) links.push({ label: "Wikipedia", url: `https://${entity.sitelinks?.enwiki ? "en" : "fr"}.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, "_"))}` })

  const description = entity.descriptions?.en?.value ?? entity.descriptions?.fr?.value ?? null
  return { description, facts, links, match, url: `https://www.wikidata.org/wiki/${entity.id}` }
}

/**
 * The official website Wikidata lists for a company with exactly this name,
 * when exactly one company-like entity has one. Beats guessing domains:
 * safran.com names "Safran" but is a different company from Safran SA.
 */
export async function wikidataWebsite(name: string): Promise<string | null> {
  const search = (await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=7&language=en&search=${encodeURIComponent(name)}`)) as { search?: { id: string }[] }
  const candidates = Object.values(await entities((search.search ?? []).map((item) => item.id)))
    .filter((candidate) => normalize(label(candidate) ?? "") === normalize(name) && (values(candidate, "P1128").length || values(candidate, "P452").length))
  const sites = [...new Set(candidates.flatMap((candidate) => values(candidate, "P856").map(String)).filter((url) => /^https?:\/\//.test(url)))]
  const hosts = new Set(sites.map((url) => bareHost(url)))
  return hosts.size === 1 ? new URL(sites[0]).origin : null
}

/* ------------------------- French business registry ------------------------- */

const HEADCOUNT: Record<string, string> = {
  "00": "0", "01": "1–2", "02": "3–5", "03": "6–9", "11": "10–19", "12": "20–49", "21": "50–99", "22": "100–199",
  "31": "200–249", "32": "250–499", "41": "500–999", "42": "1,000–1,999", "51": "2,000–4,999", "52": "5,000–9,999", "53": "10,000+",
}
const CATEGORY: Record<string, string> = { PME: "Small or medium business", ETI: "Mid-size company", GE: "Large company" }

type RegistryResult = {
  siren: string; nom_complet: string; nom_raison_sociale?: string | null; sigle?: string | null; date_creation?: string | null
  tranche_effectif_salarie?: string | null; categorie_entreprise?: string | null; etat_administratif?: string
  siege?: { libelle_commune?: string | null; site_web?: string[] | null }; complements?: { liste_idcc?: string[] | null }
}

async function fromRegistry(name: string): Promise<{ facts: ProfileFact[]; url: string } | null> {
  const data = (await getJson(`https://recherche-entreprises.api.gouv.fr/search?per_page=5&q=${encodeURIComponent(name)}`)) as { results?: RegistryResult[] }
  const wanted = normalize(name)
  const hit = (data.results ?? []).find((result) => result.etat_administratif !== "C" && [result.nom_complet, result.nom_raison_sociale, result.sigle].some((value) => value && normalize(value) === wanted))
  if (!hit) return null
  const facts: ProfileFact[] = []
  const add = (labelText: string, value: string | null | undefined) => {
    if (value) facts.push({ label: labelText, value, source: "registry" })
  }
  add("Staff (France)", hit.tranche_effectif_salarie ? HEADCOUNT[hit.tranche_effectif_salarie] : null)
  add("Size", hit.categorie_entreprise ? CATEGORY[hit.categorie_entreprise] : null)
  add("Registered", hit.date_creation?.slice(0, 4))
  add("Head office", hit.siege?.libelle_commune ? titleCase(hit.siege.libelle_commune) : null)
  add("SIREN", hit.siren)
  return { facts, url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${hit.siren}` }
}

const titleCase = (value: string) => value.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toUpperCase())

/* ---------------------------------- public ---------------------------------- */

/** Fetch, merge and store. Never throws: a source that fails is just left out. */
export async function refreshCompanyProfile(companyId: string): Promise<CompanyProfile | null> {
  const [company] = await db.select({ name: companies.name, website: companies.website }).from(companies).where(eq(companies.id, companyId))
  if (!company) return null
  const [wiki, registry] = await Promise.allSettled([fromWikidata(company.name, company.website), fromRegistry(company.name)])
  const w = wiki.status === "fulfilled" ? wiki.value : null
  const r = registry.status === "fulfilled" ? registry.value : null
  const seen = new Set<string>()
  const facts = [...(w?.facts ?? []), ...(r?.facts ?? [])].filter((fact) => {
    // Wikidata's worldwide headquarters wins over the French head office when both exist.
    const key = fact.label === "Head office" ? "Headquarters" : fact.label
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const profile: CompanyProfile = {
    description: w?.description ?? null,
    facts,
    links: w?.links ?? [],
    sources: [w && { name: "Wikidata", url: w.url }, r && { name: "Annuaire des entreprises", url: r.url }].filter(Boolean) as CompanyProfile["sources"],
    match: w?.match ?? (r ? "name" : null),
    fetchedAt: new Date().toISOString(),
  }
  // Both sources down: don't store an empty profile, so the next visit tries again.
  if (wiki.status === "rejected" && registry.status === "rejected") return null
  await db.update(companies).set({ profile, profiledAt: new Date() }).where(eq(companies.id, companyId))
  return profile
}

const STALE_MS = 1000 * 60 * 60 * 24 * 60

/** The stored profile, fetched first if there is none yet or it is two months old. */
export async function companyProfile(company: { id: string; profile: unknown; profiledAt: Date | null }): Promise<CompanyProfile | null> {
  const fresh = company.profiledAt && Date.now() - company.profiledAt.getTime() < STALE_MS
  if (fresh) return company.profile as CompanyProfile | null
  if (!(await companyFactsEnabled())) return (company.profile as CompanyProfile | null) ?? null
  return (await refreshCompanyProfile(company.id)) ?? ((company.profile as CompanyProfile | null) ?? null)
}
