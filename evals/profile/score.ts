/**
 * Scores an imported profile against what an invented CV really says.
 * Pure: used by `npm run profile:eval` (needs a model) and by the offline
 * extraction tests. One point per expected entry found, plus one per field
 * that entry should carry; a missing or merged entry loses all of its points.
 */
import { entryView, type EntryFields } from "../../src/lib/entry-fields"

export type ExpectedEntry = {
  kind: string; name: string; org?: string; start?: string; end?: string; location?: string; bullets?: number
  level?: string; test?: string; skills?: string[]; credentialId?: string; url?: string; employment?: string
}
export type Expected = {
  language?: string
  identity?: { fullName?: string; headline?: string; email?: string; phone?: string; location?: string; links?: string[] }
  entries?: ExpectedEntry[]
  /** The file cannot be read; the import must say so instead of returning entries. */
  error?: string
}
export type Imported = {
  language: string
  identity: { fullName: string; headline: string; email: string; phone: string; location: string; links: { label: string; url: string }[] }
  entries: { kind: string; text: Record<string, string>; fields: EntryFields; facts: string[]; skills: string[]; bullets: { text: string }[] }[]
}
export type Score = { points: number; total: number; found: number; expected: number; extras: string[]; problems: string[] }

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
const has = (hay: string, needle: string) => fold(hay).includes(fold(needle))
const digits = (value: string) => value.replace(/\D/g, "")

/** Kinds that hold the same thing: a talk saved as an achievement is found, not missing. */
const ACCEPT: Record<string, string[]> = { event: ["event", "achievement", "other"], other: ["other", "achievement", "experience"], project: ["project", "other"] }

function dates(entry: Imported["entries"][number]) {
  const fields = entry.fields as Record<string, unknown>
  const range = fields.dates as { start?: string; end?: string } | undefined
  const point = (fields.issued ?? fields.date) as string | undefined
  return { start: range?.start ?? point ?? "", end: range?.end ?? "" }
}
const strings = (entry: Imported["entries"][number]) => [...Object.values(entry.text), ...Object.values(entry.fields).filter((value): value is string => typeof value === "string")]

export function scoreImport(expected: Expected, imported: Imported): Score {
  const problems: string[] = []
  let points = 0
  let total = 0
  const check = (label: string, ok: boolean, got: unknown) => {
    total += 1
    if (ok) points += 1
    else problems.push(`${label} (got ${JSON.stringify(got)})`)
  }
  if (expected.language) check(`language should be ${expected.language}`, imported.language === expected.language, imported.language)
  const id = expected.identity ?? {}
  if (id.fullName) check("identity.fullName", fold(imported.identity.fullName) === fold(id.fullName), imported.identity.fullName)
  if (id.headline) check("identity.headline", has(imported.identity.headline, id.headline), imported.identity.headline)
  if (id.email) check("identity.email", imported.identity.email.trim().toLowerCase() === id.email, imported.identity.email)
  if (id.phone) check("identity.phone", digits(imported.identity.phone) === digits(id.phone), imported.identity.phone)
  if (id.location) check("identity.location", has(imported.identity.location, id.location), imported.identity.location)
  for (const link of id.links ?? []) check(`identity link ${link}`, imported.identity.links.some((item) => item.url.toLowerCase().includes(link)), imported.identity.links.map((item) => item.url))

  const used = new Set<number>()
  let found = 0
  for (const want of expected.entries ?? []) {
    const label = `${want.kind} "${want.name || want.skills?.join(", ")}"`
    const kinds = ACCEPT[want.kind] ?? [want.kind]
    let best = -1
    let bestScore = 0
    imported.entries.forEach((entry, index) => {
      if (used.has(index) || !kinds.includes(entry.kind)) return
      const view = entryView({ kind: entry.kind, display: { x: entry.text }, fields: entry.fields }, "x")
      const all = [...strings(entry), ...entry.facts].join(" | ")
      const name = want.name ? (has(view.heading, want.name) ? 3 : has(strings(entry).join(" | "), want.name) ? 2 : has(all, want.name) ? 1 : 0) : 0
      const org = want.org && has(all, want.org) ? 1 : 0
      const skills = want.skills ? want.skills.filter((skill) => entry.skills.some((item) => fold(item) === fold(skill))).length / want.skills.length : 0
      const when = want.start && dates(entry).start === want.start ? 0.5 : 0
      const score = name + org + skills * 3 + (name || org || skills ? when : 0)
      if (score > bestScore && (name > 0 || skills >= 0.5)) {
        best = index
        bestScore = score
      }
    })
    const fieldCount = ["org", "start", "end", "location", "bullets", "level", "test", "skills", "credentialId", "url", "employment"].filter((key) => (want as Record<string, unknown>)[key] !== undefined).length + (want.name ? 1 : 0)
    total += 1
    if (best < 0) {
      total += fieldCount
      problems.push(`${label}: missing or merged into another entry`)
      continue
    }
    used.add(best)
    found += 1
    points += 1
    const entry = imported.entries[best]
    const view = entryView({ kind: entry.kind, display: { x: entry.text }, fields: entry.fields }, "x")
    const own = strings(entry).join(" | ")
    const when = dates(entry)
    if (want.name) check(`${label}: name`, has(view.heading, want.name), view.heading)
    if (want.org) check(`${label}: organisation ${want.org}`, has(own, want.org), own)
    if (want.start) check(`${label}: start ${want.start}`, when.start === want.start, when.start)
    if (want.end) check(`${label}: end ${want.end}`, when.end === want.end, when.end)
    if (want.location) check(`${label}: location ${want.location}`, has(own, want.location), own)
    if (want.bullets) check(`${label}: ${want.bullets} bullet(s)`, entry.facts.length >= want.bullets, entry.facts.length)
    if (want.level) check(`${label}: level ${want.level}`, entry.fields.level === want.level, entry.fields.level ?? null)
    if (want.test) check(`${label}: test ${want.test}`, has(String(entry.fields.test ?? ""), want.test), entry.fields.test ?? null)
    if (want.skills) check(`${label}: skills`, want.skills.every((skill) => entry.skills.some((item) => fold(item) === fold(skill))), entry.skills)
    if (want.credentialId) check(`${label}: credential id`, entry.fields.credentialId === want.credentialId, entry.fields.credentialId ?? null)
    if (want.url) check(`${label}: url`, [entry.fields.url, entry.fields.repo].some((value) => typeof value === "string" && value.toLowerCase().includes(want.url!)), entry.fields.url ?? entry.fields.repo ?? null)
    if (want.employment) check(`${label}: employment ${want.employment}`, entry.fields.employment === want.employment, entry.fields.employment ?? null)
  }
  const extras = imported.entries.flatMap((entry, index) => (used.has(index) ? [] : [`${entry.kind}: ${entryView({ kind: entry.kind, display: { x: entry.text }, fields: entry.fields }, "x").heading || entry.skills.slice(0, 4).join(", ") || entry.facts[0] || "(empty)"}`]))
  return { points, total, found, expected: expected.entries?.length ?? 0, extras, problems }
}
