/**
 * Public facts added to a profile entry from online sources: about the
 * organisation, the certification or the event the entry names, never about
 * the person. Every block keeps where it came from, is shown apart from what
 * the CV said, and is only stored once the person accepts it. Pure.
 */

export type EnrichmentSource = { name: string; url: string }
export type EnrichmentFact = { label: "industry" | "employees" | "size" | "founded" | "headquarters" | "parent" | "issuer" | "organizer" | "place" | "date" | "country"; value: string }

/** What an entry keeps once accepted. */
export type EntryEnrichment = {
  subject: "organization" | "certification" | "event" | "skills"
  /** The name the lookup was made with, as the entry had it. */
  query: string
  /** The official name the source gives. */
  name: string
  description: string | null
  website: string | null
  facts: EnrichmentFact[]
  sources: EnrichmentSource[]
  /** Entry fields that were empty and were filled from the source (field → value). */
  filled: Record<string, string>
  /** Skills renamed to their usual spelling: what the CV said, and the name kept. */
  skills?: { from: string; to: string; source: string }[]
  fetchedAt: string
}

/** A lookup result offered on the review screen. Nothing here is applied until the person keeps it. */
export type EnrichmentSuggestion = {
  about: Omit<EntryEnrichment, "filled" | "skills"> | null
  /** A logo stored from the organisation's own site, ready to attach. */
  logoPath: string | null
  /** The official name, when it differs from the entry's wording. Off by default: the person's wording stays. */
  officialName: { field: string; value: string } | null
  /** Empty entry fields the source can fill. */
  fill: { field: string; value: string }[]
  /** Skills whose usual spelling differs, with the family each belongs to. */
  skills: { from: string; to: string; category: SkillCategory; source: string }[]
  /** Families for an unsorted skill list (the group is split by family when accepted). */
  groups: { category: SkillCategory; skills: string[] }[]
}

export const SKILL_CATEGORIES = ["language", "framework", "database", "platform", "tool", "other"] as const
export type SkillCategory = (typeof SKILL_CATEGORIES)[number]

const fold = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
/** Letters and digits only: "Node.js", "node js" and "NodeJS" meet; "C++" and "C#" stay apart from "C". */
export const skillKey = (value: string) => fold(value).replace(/\+/g, "plus").replace(/#/g, "sharp").replace(/[^a-z0-9]+/g, "")
/** Names compared without legal forms, accents or punctuation. */
export const nameKey = (value: string) => fold(value).replace(/\(.*?\)/g, " ").replace(/\b(inc|ltd|llc|gmbh|sa|sas|sasu|sarl|plc|corp|corporation|company|co|group|groupe|ag|bv|nv|se|the)\b\.?/g, " ").replace(/[^a-z0-9؀-ۿ]+/g, "")

/** "Certified Kubernetes Administrator (CKA)" → ["Certified Kubernetes Administrator", "CKA"]. */
export function nameVariants(name: string): string[] {
  const inner = [...name.matchAll(/\(([^)]{2,20})\)/g)].map((match) => match[1].trim())
  const outer = name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()
  return [...new Set([name.trim(), outer, ...inner].filter((item) => item.length >= 2))]
}

/** An event's name without its edition: "PyData Berlin 2023" → { series: "PyData Berlin", year: "2023" }. */
export function eventEdition(name: string): { series: string; year: string | null } {
  const year = name.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/)?.[1] ?? null
  return { series: name.replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/, " ").replace(/['’]\d{2}\b/, " ").replace(/\s+/g, " ").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim(), year }
}

/** Group names a person would not have chosen: the list is unsorted and can be split by family. */
export const genericSkillGroup = (name: string) => /^(?:skills?|technical skills|comp[ée]tences|competencias|habilidades|kenntnisse|f[aä]higkeiten|competenze|linkedin skills.*|المهارات|technologies|tools|outils|stack|tech stack)?$/i.test(name.trim())
