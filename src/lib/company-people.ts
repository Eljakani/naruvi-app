/**
 * Finding people at a company with an Apify actor (your own token): the
 * actor's input for a company, and a dataset item as a person. Pure, so it
 * can be tested without the network. Items are untrusted input.
 */
export const PEOPLE_ACTOR = "atomus~linkedin-company-employees"
/** Each person found costs a little on your Apify account; a few well-chosen ones are enough to write to. */
export const PEOPLE_LIMIT = 10

export type CompanyPerson = { name: string; title: string; linkedinUrl: string; location: string; email: string }

/** "Recruiter, engineering manager" → ["Recruiter", "engineering manager"]. */
export function peopleTitles(text: string) {
  return [...new Set(text.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean))].slice(0, TITLE_LIMIT)
}

/** Titles one search may send: every variant of a few families, plus your own. */
export const TITLE_LIMIT = 80

/** A LinkedIn company page ("linkedin.com/company/exalt-it"), cleaned; null when it isn't one. */
export function linkedinCompany(text: string) {
  const match = text.trim().match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/company\/([^/?#\s]+)/i)
  return match ? `https://www.linkedin.com/company/${match[1]}` : null
}

/** The actor takes a LinkedIn company page (most reliable) or the company's domain. */
export function peopleInput(company: string, titles: string[], limit = PEOPLE_LIMIT) {
  const target = linkedinCompany(company) ?? new URL(company).hostname.replace(/^www\./, "")
  return { company: target, maxResults: limit, ...(titles.length ? { title: titles, titleMatchMode: "SMART" } : {}), findEmail: false }
}

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "")

export function personFrom(item: Record<string, unknown>): CompanyPerson | null {
  if (item.status && item.status !== "success" && item.status !== "preview") return null
  const name = str(item.full_name).slice(0, 120)
  const url = str(item.linkedin_url).replace(/^http:/, "https:").replace(/\/+$/, "")
  const linkedinUrl = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#\s]+$/i.test(url) ? url : ""
  if (!name || !linkedinUrl) return null
  return { name, title: (str(item.title) || str(item.headline)).slice(0, 160), linkedinUrl, location: str(item.location).slice(0, 160), email: str(item.email).toLowerCase().slice(0, 254) }
}

type Fact = { label: string; value: string }

/** "1–2" → 2, "2,000–4,999" → 4999, "164,000" → 164000: the upper bound of a headcount. */
function headcount(value: string) {
  const numbers = value.match(/\d[\d,.\s]*/g)?.map((part) => Number(part.replace(/[,.\s]/g, ""))).filter((n) => Number.isFinite(n)) ?? []
  return numbers.length ? Math.max(...numbers) : null
}

/**
 * Whether a company looks like a startup, from its public facts: small (at
 * most 250 people, or an SME by registry class) and young (founded or
 * registered in the last 12 years). Founders and CTOs there read their own
 * messages. `null` when the facts don't say; large or mid-size is never one.
 */
export function startupSignal(facts: Fact[], year = new Date().getFullYear()): { startup: boolean | null; reason: { size: string; since: string } | null } {
  const find = (...labels: string[]) => facts.find((fact) => labels.includes(fact.label))?.value ?? ""
  const people = find("Employees", "Staff (France)")
  const size = find("Size")
  const since = Number(find("Founded", "Registered").match(/\d{4}/)?.[0] ?? NaN)
  const count = people ? headcount(people) : null
  if (/large|mid-size/i.test(size) || (count !== null && count > 250)) return { startup: false, reason: null }
  const small = (count !== null && count <= 250) || /small or medium/i.test(size)
  const young = Number.isFinite(since) && since >= year - 12
  if (small && young) return { startup: true, reason: { size: people || size, since: String(since) } }
  return { startup: small && Number.isFinite(since) ? false : null, reason: null }
}

/**
 * Who to look for, as role families. Each family lists the ways companies
 * actually write that title, in English and French, so one tap matches as
 * many people as possible; your own titles are added on top.
 */
export const ROLE_FAMILIES = {
  founders: ["CEO", "Founder", "Co-founder", "Cofounder", "Chief Executive Officer", "Managing Director", "General Manager", "President", "Fondateur", "Fondatrice", "Cofondateur", "Cofondatrice", "Co-fondateur", "Co-fondatrice", "Président", "Présidente", "Directeur général", "Directrice générale", "Gérant", "Gérante"],
  tech: ["CTO", "Chief Technology Officer", "VP Engineering", "VP of Engineering", "Head of Engineering", "Head of Tech", "Head of Technology", "Director of Engineering", "Engineering Director", "Engineering Manager", "Tech Lead", "Technical Lead", "Lead Developer", "Lead Engineer", "Directeur technique", "Directrice technique", "Directeur des systèmes d'information", "DSI", "Responsable technique", "Manager technique", "Lead dev"],
  security: ["CISO", "Chief Information Security Officer", "Head of Security", "Security Manager", "Security Lead", "RSSI", "Responsable sécurité", "Directeur cybersécurité", "Head of Infrastructure", "Infrastructure Manager", "Head of DevOps", "DevOps Lead", "Platform Lead", "Head of Platform", "SRE Manager"],
  recruiting: ["Recruiter", "Technical Recruiter", "Tech Recruiter", "IT Recruiter", "Talent Acquisition", "Talent Acquisition Specialist", "Talent Acquisition Manager", "Talent Acquisition Partner", "Head of Talent", "Head of Talent Acquisition", "Talent Manager", "Talent Partner", "Sourcer", "Chargé de recrutement", "Chargée de recrutement", "Responsable recrutement", "Recruteur", "Recruteuse", "Chargé d'acquisition de talents", "Talent Acquisition Lead"],
  hr: ["HR Manager", "Head of People", "People Partner", "HR Business Partner", "HRBP", "Chief People Officer", "People Manager", "Responsable RH", "Responsable des ressources humaines", "DRH", "Directeur des ressources humaines", "Directrice des ressources humaines", "Chargé RH", "Chargée RH"],
} as const
export type RoleFamily = keyof typeof ROLE_FAMILIES
export const ROLE_FAMILY_KEYS = Object.keys(ROLE_FAMILIES) as RoleFamily[]

/**
 * A group of people worth contacting at a company, with every common way
 * their title is written. Generated from your profile and goals (see
 * src/server/contacts/role-groups.ts); the built-in families are the
 * fallback. `label` is null for a built-in group (the UI names it).
 */
export type RoleGroup = { id: string; label: Record<"en" | "fr" | "ar", string> | null; titles: string[]; forStartup: boolean; forLarge: boolean }

export const BUILT_IN_GROUPS: RoleGroup[] = ROLE_FAMILY_KEYS.map((id) => ({ id, label: null, titles: [...ROLE_FAMILIES[id]], forStartup: id === "founders" || id === "tech", forLarge: id === "recruiting" || id === "tech" }))

/** The groups a search starts with: at a startup the ones for startups (founders, tech leads), elsewhere the ones for larger companies. */
export const defaultGroups = (groups: RoleGroup[], startup: boolean | null) => groups.filter((group) => (startup === null ? group.forStartup || group.forLarge : startup ? group.forStartup : group.forLarge)).map((group) => group.id)

/** Every title of the chosen groups plus your own, your own first, once each (case-insensitive), within the search's limit. */
export function searchTitles(groups: RoleGroup[], chosen: string[], custom: string[]) {
  const seen = new Set<string>()
  return [...custom, ...groups.filter((group) => chosen.includes(group.id)).flatMap((group) => group.titles)].map((title) => title.trim()).filter((title) => {
    const key = title.toLowerCase()
    if (!title || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, TITLE_LIMIT)
}

/** What the role groups are generated from; when it drifts, they're generated again. */
export type RoleGroupBasis = { roles: string[]; headline: string; skills: string[] }

const terms = (basis: RoleGroupBasis) => new Set([...basis.roles, ...basis.skills, ...basis.headline.split(/[^\p{L}\p{N}+#]+/u)].map((term) => term.trim().toLowerCase()).filter((term) => term.length > 1))

/**
 * Whether the profile moved enough to regenerate: any change in the goals'
 * roles, or less than two thirds of the headline and skill terms in common.
 * Small edits (a skill added) keep the groups.
 */
export function basisDrifted(before: RoleGroupBasis | null, now: RoleGroupBasis) {
  if (!before) return true
  const roles = (basis: RoleGroupBasis) => [...new Set(basis.roles.map((role) => role.trim().toLowerCase()))].sort().join("|")
  if (roles(before) !== roles(now)) return true
  const a = terms(before)
  const b = terms(now)
  const shared = [...a].filter((term) => b.has(term)).length
  const union = new Set([...a, ...b]).size
  return union > 0 && shared / union < 2 / 3
}

/** What kind of contact a title describes, for sorting and filtering contacts. Most senior wins ("CEO & Co-Founder" → leader). */
export type ContactKind = "leader" | "tech" | "recruiting" | "hr" | "other"
export const CONTACT_KINDS: ContactKind[] = ["leader", "tech", "recruiting", "hr", "other"]

const KIND_TITLES: [ContactKind, readonly string[]][] = [
  ["leader", ROLE_FAMILIES.founders],
  ["recruiting", ROLE_FAMILIES.recruiting],
  ["hr", ROLE_FAMILIES.hr],
  ["tech", [...ROLE_FAMILIES.tech, ...ROLE_FAMILIES.security]],
]
const KIND_PATTERNS = KIND_TITLES.map(([kind, titles]) => [kind, new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...new Set(titles.map((title) => title.toLowerCase()))].sort((a, b) => b.length - a.length).map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}])`, "iu")] as const)

export function contactKind(title: string): ContactKind {
  return KIND_PATTERNS.find(([, pattern]) => pattern.test(title))?.[0] ?? "other"
}
