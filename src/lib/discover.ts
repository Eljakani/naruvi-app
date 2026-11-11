/**
 * Job discovery: turn the profile into a few searches, an Apify result into a
 * job lead, and rank leads against the profile's skills. Pure, so it can be
 * tested without the network.
 */
import { countryIn } from "@/lib/geo"
import { canonicalJobUrl } from "@/lib/job-alerts"
import type { SearchGoal } from "@/lib/search-goals"

/** How a discovered lead's source starts ("Discovered: Backend engineer"). */
export const DISCOVERED = "Discovered"
export const DISCOVER_BOARDS = { linkedin: "LinkedIn", indeed: "Indeed" } as const
export type DiscoverBoard = keyof typeof DISCOVER_BOARDS

export type DiscoverProfile = { location: string; goals: SearchGoal[] }
/** `country` is an ISO code, when the place names one (Indeed needs it). */
export type DiscoverSearch = { keywords: string; location: string; country: string | null }
export type DiscoverLead = { url: string; title: string; board: string; text: string; location: string; contract: string; company: string; logo: string }

/**
 * The searches a discovery run makes, from your active search goals only:
 * each goal's roles in that goal's places ("Remote" when it allows remote,
 * your location when it names none). No goal with roles, no search: one
 * place states what you want, so results can't drift from it. Six at most;
 * every role is searched, places are cut first.
 */
export function discoverSearches(profile: Pick<DiscoverProfile, "location" | "goals">): DiscoverSearch[] {
  const goals = profile.goals.filter((goal) => goal.active && goal.roles.length)
  const roles = new Set(goals.flatMap((goal) => goal.roles.map((role) => role.toLowerCase()))).size
  if (!roles) return []
  const home = countryIn(profile.location)
  const perRole = Math.max(1, Math.min(3, Math.floor(6 / roles)))
  const pairs = goals.flatMap((goal) => {
    const places = [...goal.places, ...(goal.workModes.includes("remote") ? ["Remote"] : [])]
    const unique = [...new Set((places.length ? places : [profile.location]).map((place) => place.trim()))].slice(0, perRole)
    return goal.roles.flatMap((role) => unique.map((location) => ({ keywords: role.trim(), location, country: countryIn(location) ?? home })))
  })
  return [...new Map(pairs.map((pair) => [`${pair.keywords.toLowerCase()}|${pair.location.toLowerCase()}`, pair])).values()].slice(0, 6)
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const list = (value: unknown, glue: string) => (Array.isArray(value) ? value.filter((part) => typeof part === "string").join(glue) : str(value))

/** The posting text is kept with the lead, so importing it needs no login. */
function lead(fields: { link: string; title: string; company: string; location: string; contract: string; salary: string; text: string; logo: string }): DiscoverLead | null {
  const link = canonicalJobUrl(fields.link)
  if (!link || !fields.title) return null
  const header = [fields.title, fields.company, fields.location, fields.contract, fields.salary].filter(Boolean).join("\n")
  return { ...link, title: (fields.company ? `${fields.title} · ${fields.company}` : fields.title).slice(0, 300), text: `${header}\n\n${fields.text}`.slice(0, 100_000), location: fields.location, contract: fields.contract, company: fields.company, logo: /^https:\/\//.test(fields.logo) ? fields.logo : "" }
}

type Item = Record<string, unknown>

/** One Apify actor per board: its input for a search (null: can't run it), and a dataset item as a lead. Items are untrusted input. */
export const DISCOVER_ACTORS: Record<DiscoverBoard, { actor: string; input: (search: DiscoverSearch, limit: number) => object | null; lead: (item: Item) => DiscoverLead | null }> = {
  linkedin: {
    actor: "curious_coder~linkedin-jobs-scraper",
    input: ({ keywords, location }, limit) => ({ keywords, location, limitPerSource: limit, scrapeCompany: false, splitByLocation: false }),
    lead: (item) => lead({ link: str(item.link), title: str(item.title), company: str(item.companyName), location: str(item.location), contract: str(item.employmentType), salary: list(item.salaryInfo, " - "), text: str(item.descriptionText), logo: str(item.companyLogo) }),
  },
  indeed: {
    actor: "misceres~indeed-scraper",
    input: ({ keywords, location, country }, limit) => (country ? { position: keywords, location, country: country.toUpperCase(), maxItemsPerSearch: limit, parseCompanyDetails: false, saveOnlyUniqueItems: true } : null),
    lead: (item) => lead({ link: str(item.url), title: str(item.positionName), company: str(item.company), location: str(item.location), contract: list(item.jobType, ", "), salary: str(item.salary), text: str(item.description), logo: str(item.companyLogo) }),
  },
}

/**
 * A discovered lead's stored text, split back: the header lines the run wrote
 * (role, company, place, contract, salary) and the posting itself. Other
 * leads (extension captures) are all body.
 */
export function leadParts(text: string, discovered: boolean) {
  const at = discovered ? text.indexOf("\n\n") : -1
  if (at < 0) return { facts: [] as string[], body: text.trim() }
  return { facts: text.slice(0, at).split("\n").slice(2).map((line) => line.trim()).filter(Boolean).slice(0, 4), body: text.slice(at + 2).trim() }
}

/** The opening of a posting, cut at a word, for a preview. */
export function excerpt(body: string, max = 260) {
  const flat = body.replace(/\s+/g, " ").trim()
  return flat.length <= max ? flat : `${flat.slice(0, flat.lastIndexOf(" ", max)).replace(/[,.;:\s]+$/, "")}…`
}

/** The roles your active search goals ask for; empty when none names one. */
export const goalRoles = (goals: SearchGoal[]) => [...new Set(goals.filter((goal) => goal.active).flatMap((goal) => goal.roles))]

/** Job-title words that say nothing about the job itself. */
const GENERIC = new Set(["engineer", "engineering", "developer", "development", "senior", "junior", "lead", "manager", "specialist", "expert", "consultant", "ingenieur", "ingénieur", "developpeur", "développeur", "and", "the", "for", "des", "les"])

/** The search keywords a discovered lead was found for ("Discovered: DevOps, SRE" → ["DevOps", "SRE"]); null for other leads. */
export function discoveredKeywords(source: string) {
  return source.startsWith(`${DISCOVERED}: `) ? source.slice(DISCOVERED.length + 2).split(", ").filter(Boolean) : null
}

/** Whether a posting's title is about what you searched for: it names a telling word of one keyword ("Cyber Security engineer" → cyber, security). Job boards pad results with loosely related postings. */
/** Roles that postings spell out ("AppSec" → "Application Security Engineer"). Lowercase; matched inside the title. */
const ROLE_ALIASES: Record<string, string[]> = {
  appsec: ["application security", "product security", "app security"],
  devsecops: ["secdevops", "devops security"],
  devops: ["site reliability", "platform engineer", "infrastructure engineer"],
  sre: ["site reliability"],
  secops: ["security operations", "soc analyst"],
  cybersecurity: ["cyber security", "cyber-security", "cybersécurité"],
  ml: ["machine learning"],
  ai: ["artificial intelligence", "intelligence artificielle"],
  fullstack: ["full stack", "full-stack"],
  frontend: ["front end", "front-end"],
  backend: ["back end", "back-end"],
}

export function titleFits(title: string, keywords: string[]) {
  const lower = title.toLowerCase()
  if (keywords.some((keyword) => ROLE_ALIASES[keyword.toLowerCase().replace(/\s+/g, "")]?.some((alias) => lower.includes(alias)))) return true
  const words = keywords.flatMap((keyword) => keyword.toLowerCase().split(/[^\p{L}\p{N}+#]+/u)).filter((word) => word.length >= 2 && !GENERIC.has(word))
  if (!words.length) return true
  const text = title.toLowerCase()
  // Long words may sit inside another ("devops" in "SecDevOps"); short ones must start a word ("go" isn't in "Google").
  return words.some((word) => (word.length >= 5 ? text.includes(word) : new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(text)))
}

/** The profile skills a posting names, as whole words ("Go" doesn't match "Google"). */
export function skillMatches(text: string, skills: string[]): string[] {
  const seen = new Set<string>()
  return skills.filter((skill) => {
    const key = skill.trim().toLowerCase()
    if (key.length < 2 || seen.has(key)) return false
    seen.add(key)
    return new RegExp(`(?<![\\p{L}\\p{N}])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text)
  })
}
