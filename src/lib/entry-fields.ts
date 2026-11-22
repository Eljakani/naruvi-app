/**
 * The shape of each profile entry kind. Every kind has its own fields; there is
 * no generic "title" or "role". Fields are either written per CV language
 * (`text` → entries.display[lang]) or stored once (`fields` → entries.fields).
 *
 * Everything that shows an entry (cards, editor preview, CV, prompts) derives
 * its heading and detail lines from these fields through `entryView`.
 */
import { z } from "zod"
import { formatDateRange, parseDateRange, type DateRange, type MonthYear } from "@/lib/date-range"

export const ENTRY_KINDS = ["experience", "education", "project", "skill", "certification", "language", "achievement", "event", "other"] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]
export type CvLang = "en" | "fr"

/* ------------------------------------------------------------------ options */

export const OPTIONS = {
  employment: ["full_time", "part_time", "fixed_term", "internship", "apprenticeship", "freelance", "volunteer"],
  workMode: ["onsite", "hybrid", "remote"],
  projectContext: ["personal", "academic", "professional", "open_source", "hackathon"],
  languageLevel: ["native", "C2", "C1", "B2", "B1", "A2", "A1"],
  eventRole: ["speaker", "panelist", "organizer", "attendee", "volunteer_staff"],
} as const
export type OptionSet = keyof typeof OPTIONS

/** Option words in the CV's language (and the interface's: en/fr/ar). */
const OPTION_LABELS: Record<string, Record<"en" | "fr" | "ar", string>> = {
  full_time: { en: "Full-time", fr: "CDI", ar: "دوام كامل" },
  part_time: { en: "Part-time", fr: "Temps partiel", ar: "دوام جزئي" },
  fixed_term: { en: "Fixed-term", fr: "CDD", ar: "عقد محدد المدة" },
  internship: { en: "Internship", fr: "Stage", ar: "تدريب" },
  apprenticeship: { en: "Apprenticeship", fr: "Alternance", ar: "تدريب مهني" },
  freelance: { en: "Freelance", fr: "Freelance", ar: "عمل حر" },
  volunteer: { en: "Volunteer", fr: "Bénévolat", ar: "تطوع" },
  onsite: { en: "On-site", fr: "Sur site", ar: "حضوري" },
  hybrid: { en: "Hybrid", fr: "Hybride", ar: "هجين" },
  remote: { en: "Remote", fr: "Télétravail", ar: "عن بعد" },
  personal: { en: "Personal project", fr: "Projet personnel", ar: "مشروع شخصي" },
  academic: { en: "Academic project", fr: "Projet académique", ar: "مشروع أكاديمي" },
  professional: { en: "Professional project", fr: "Projet professionnel", ar: "مشروع مهني" },
  open_source: { en: "Open source", fr: "Open source", ar: "مفتوح المصدر" },
  hackathon: { en: "Hackathon", fr: "Hackathon", ar: "هاكاثون" },
  speaker: { en: "Speaker", fr: "Intervenant", ar: "متحدث" },
  panelist: { en: "Panelist", fr: "Panéliste", ar: "مشارك في حلقة نقاش" },
  organizer: { en: "Organizer", fr: "Organisateur", ar: "منظم" },
  attendee: { en: "Attendee", fr: "Participant", ar: "حاضر" },
  volunteer_staff: { en: "Volunteer", fr: "Bénévole", ar: "متطوع" },
  native: { en: "Native", fr: "Langue maternelle", ar: "اللغة الأم" },
}
export function optionLabel(value: string, lang: string): string {
  const labels = OPTION_LABELS[value]
  if (!labels) return value // CEFR levels read the same everywhere
  return labels[(lang === "fr" || lang === "ar" ? lang : "en") as "en" | "fr" | "ar"]
}

/* ------------------------------------------------------------------ fields */

export type FieldType = "text" | "select" | "dates" | "month" | "url"
export type FieldSpec = {
  key: string
  type: FieldType
  /** Written per CV language. */
  translated?: boolean
  options?: OptionSet
  /** The entry is unnamed without it. */
  required?: boolean
  /** Spans both form columns. */
  wide?: boolean
}

const f = (key: string, type: FieldType, extra: Omit<FieldSpec, "key" | "type"> = {}): FieldSpec => ({ key, type, ...extra })

export const KIND_FIELDS: Record<EntryKind, FieldSpec[]> = {
  experience: [
    f("position", "text", { translated: true, required: true }),
    f("company", "text", { required: true }),
    f("employment", "select", { options: "employment" }),
    f("workMode", "select", { options: "workMode" }),
    f("location", "text", { translated: true }),
    f("dates", "dates", { wide: true }),
  ],
  education: [
    f("degree", "text", { translated: true, required: true }),
    f("field", "text", { translated: true }),
    f("school", "text", { required: true }),
    f("location", "text", { translated: true }),
    f("honours", "text", { translated: true }),
    f("dates", "dates", { wide: true }),
  ],
  project: [
    f("name", "text", { required: true }),
    f("tagline", "text", { translated: true }),
    f("context", "select", { options: "projectContext" }),
    f("url", "url"),
    f("repo", "url"),
    f("dates", "dates", { wide: true }),
  ],
  skill: [f("name", "text", { translated: true, required: true, wide: true })],
  certification: [
    f("name", "text", { required: true }),
    f("issuer", "text"),
    f("issued", "month"),
    f("expires", "month"),
    f("credentialId", "text"),
    f("url", "url"),
  ],
  language: [
    f("language", "text", { translated: true, required: true }),
    f("level", "select", { options: "languageLevel" }),
    f("test", "text"),
  ],
  achievement: [
    f("title", "text", { translated: true, required: true }),
    f("issuer", "text"),
    f("date", "month"),
    f("context", "text", { translated: true }),
  ],
  // A talk, conference, meetup, hackathon or workshop: `title` is the talk (or the event when there is no talk), `event` the event's own name.
  event: [
    f("title", "text", { translated: true, required: true }),
    f("event", "text"),
    f("role", "select", { options: "eventRole" }),
    f("organizer", "text"),
    f("location", "text", { translated: true }),
    f("date", "month"),
    f("url", "url"),
  ],
  other: [
    f("title", "text", { translated: true, required: true }),
    f("subtitle", "text", { translated: true }),
    f("dates", "dates", { wide: true }),
    f("url", "url"),
  ],
}

export const translatedKeys = (kind: EntryKind) => KIND_FIELDS[kind].filter((field) => field.translated).map((field) => field.key)
export const sharedKeys = (kind: EntryKind) => KIND_FIELDS[kind].filter((field) => !field.translated).map((field) => field.key)

/* ------------------------------------------------------------------ storage */

/** "2023" or "2023-06". */
const monthText = z.string().regex(/^(19|20)\d{2}(-(0[1-9]|1[0-2]))?$/)
export const datesValue = z.object({ start: monthText.optional(), end: z.union([monthText, z.literal("present")]).optional() })
export type DatesValue = z.infer<typeof datesValue>

export type EntryFields = Record<string, string | DatesValue | undefined>
export type EntryText = Record<string, Record<string, string>>

const shortText = z.string().trim().max(200)

/** Validate and drop keys that don't belong to the kind. */
export function cleanFields(kind: EntryKind, raw: unknown): EntryFields {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const out: EntryFields = {}
  for (const spec of KIND_FIELDS[kind]) {
    if (spec.translated) continue
    const value = input[spec.key]
    if (value === undefined || value === null || value === "") continue
    if (spec.type === "dates") {
      const parsed = datesValue.parse(value)
      if (parsed.start || parsed.end) out[spec.key] = { ...(parsed.start ? { start: parsed.start } : {}), ...(parsed.end ? { end: parsed.end } : {}) }
    } else if (spec.type === "month") {
      out[spec.key] = monthText.parse(value)
    } else if (spec.type === "select") {
      const options = OPTIONS[spec.options!] as readonly string[]
      if (!options.includes(String(value))) throw new Error(`${spec.key} must be one of ${options.join(", ")}`)
      out[spec.key] = String(value)
    } else if (spec.type === "url") {
      out[spec.key] = z.url({ protocol: /^https?$/ }).max(2048).parse(String(value).trim())
    } else {
      const text = shortText.parse(String(value))
      if (text) out[spec.key] = text
    }
  }
  return out
}

export function cleanText(kind: EntryKind, raw: unknown): EntryText {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, Record<string, unknown>>
  const keys = translatedKeys(kind)
  const out: EntryText = {}
  for (const [lang, values] of Object.entries(input)) {
    if (!/^[a-z]{2}$/.test(lang) || !values || typeof values !== "object") continue
    const kept: Record<string, string> = {}
    for (const key of keys) {
      const text = typeof values[key] === "string" ? shortText.parse(values[key]) : ""
      if (text) kept[key] = text
    }
    if (Object.keys(kept).length) out[lang] = kept
  }
  return out
}

/* ------------------------------------------------------------------ dates */

function toMonthYear(text: string | undefined): MonthYear | null {
  if (!text) return null
  const [year, month] = text.split("-")
  return { year: Number(year), month: month ? Number(month) - 1 : null }
}
export function fromMonthYear(point: MonthYear | null): string | undefined {
  if (!point) return undefined
  return point.month === null ? String(point.year) : `${point.year}-${String(point.month + 1).padStart(2, "0")}`
}
export function toRange(value: DatesValue | undefined): DateRange {
  return { start: toMonthYear(value?.start), end: value?.end === "present" ? "present" : toMonthYear(value?.end) }
}
export function fromRange(range: DateRange): DatesValue {
  return { start: fromMonthYear(range.start), end: range.end === "present" ? "present" : fromMonthYear(range.end) }
}
/** Sortable yyyymm of the end (present = far future), then start. */
export function sortKey(entry: EntryLike): number {
  const fields = entry.fields ?? {}
  const value = (fields.dates as DatesValue | undefined) ?? { start: (fields.issued ?? fields.date) as string | undefined }
  const point = (text?: string) => (text ? Number(text.slice(0, 4)) * 100 + Number(text.slice(5, 7) || 12) : 0)
  const end = value.end === "present" ? 999999 : point(value.end ?? value.start)
  return end * 1000000 + point(value.start)
}

/* ------------------------------------------------------------------ view */

export type EntryLike = { kind: string; display: EntryText | Record<string, Record<string, string | undefined>>; fields?: EntryFields | Record<string, unknown> | null }

/** What any surface needs to show an entry. Every value is already in `lang`. */
export type EntryView = {
  /** The entry's name: position, degree, project name, certification… */
  heading: string
  /** Who/where it was with: company, school, tagline, issuer, level… */
  subheading: string
  dates: string
  location: string
  /** Smaller extras: employment type, work mode, honours, credential… */
  details: string[]
  link: string
}

const pick = (entry: EntryLike, lang: string, strict: boolean) => {
  const display = entry.display as Record<string, Record<string, string | undefined>>
  const ordered = (strict ? [display[lang]] : [display[lang], display.en, display.fr, ...Object.values(display)]).filter(Boolean)
  return (key: string) => ordered.map((values) => values?.[key]).find((value) => value?.trim())?.trim() ?? ""
}
const cvLang = (lang: string): CvLang => (lang === "fr" ? "fr" : "en")
const range = (value: unknown, lang: string) => formatDateRange(toRange(value as DatesValue | undefined), cvLang(lang))
const month = (value: unknown, lang: string) => (typeof value === "string" ? formatDateRange({ start: toMonthYear(value), end: null }, cvLang(lang)) : "")

/**
 * `strict` is for documents (CV, letter): text comes from `lang` only, and is
 * empty when the entry has none. Screens leave it off and show whatever
 * language exists rather than a blank card.
 */
export function entryView(entry: EntryLike, lang: string, { strict = false }: { strict?: boolean } = {}): EntryView {
  const text = pick(entry, lang, strict)
  const fields = (entry.fields ?? {}) as Record<string, unknown>
  const s = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string) : "")
  const opt = (key: string) => (s(key) ? optionLabel(s(key), lang) : "")
  const join = (...parts: string[]) => parts.filter(Boolean)
  switch (entry.kind as EntryKind) {
    case "experience":
      return { heading: text("position"), subheading: s("company"), dates: range(fields.dates, lang), location: text("location"), details: join(opt("employment"), opt("workMode")), link: "" }
    case "education":
      return { heading: join(text("degree"), text("field")).join(", "), subheading: s("school"), dates: range(fields.dates, lang), location: text("location"), details: join(text("honours")), link: "" }
    case "project":
      return { heading: s("name"), subheading: text("tagline"), dates: range(fields.dates, lang), location: "", details: join(opt("context")), link: s("url") || s("repo") }
    case "skill":
      return { heading: text("name"), subheading: "", dates: "", location: "", details: [], link: "" }
    case "certification": {
      const issued = month(fields.issued, lang)
      const expires = month(fields.expires, lang)
      return { heading: s("name"), subheading: s("issuer"), dates: issued && expires ? `${issued} – ${expires}` : issued, location: "", details: join(s("credentialId")), link: s("url") }
    }
    case "language": {
      const level = opt("level")
      return { heading: text("language"), subheading: join(level, s("test")).join(" · "), dates: "", location: "", details: [], link: "" }
    }
    case "achievement":
      return { heading: text("title"), subheading: s("issuer"), dates: month(fields.date, lang), location: "", details: join(text("context")), link: "" }
    case "event":
      return { heading: text("title"), subheading: s("event") === text("title") ? s("organizer") : s("event"), dates: month(fields.date, lang), location: text("location"), details: join(opt("role"), s("event") === text("title") ? "" : s("organizer")), link: s("url") }
    default:
      return { heading: text("title"), subheading: text("subtitle"), dates: range(fields.dates, lang), location: "", details: [], link: s("url") }
  }
}

/** One-line name for lists, prompts and logs. */
export function entryName(entry: EntryLike, lang = "en"): string {
  const view = entryView(entry, lang)
  return [view.heading, view.subheading].filter(Boolean).join(" — ") || "Untitled"
}

/** Whether the entry has its name in this language (shared names count everywhere). */
export function hasHeading(entry: EntryLike, lang: string): boolean {
  const required = KIND_FIELDS[entry.kind as EntryKind]?.find((spec) => spec.required)
  if (!required) return true
  if (!required.translated) return Boolean(String((entry.fields as Record<string, unknown> | undefined)?.[required.key] ?? "").trim())
  return Boolean((entry.display as Record<string, Record<string, string | undefined>>)[lang]?.[required.key]?.trim())
}

/** Plain description of an entry's fields, for prompts. */
export function describeEntry(entry: EntryLike, lang = "en"): string {
  const view = entryView(entry, lang)
  return [`${entry.kind}: ${view.heading || "(unnamed)"}`, view.subheading, view.dates, view.location, ...view.details, view.link].filter(Boolean).join(" | ")
}

/** JSON-schema-ish description of each kind's fields, for AI prompts and tools. */
export function fieldGuide(): string {
  return ENTRY_KINDS.map((kind) => {
    const parts = KIND_FIELDS[kind].map((spec) => {
      const where = spec.translated ? "per language" : "shared"
      const type = spec.type === "select" ? `one of ${OPTIONS[spec.options!].join("|")}` : spec.type === "dates" ? "{start:'YYYY[-MM]', end:'YYYY[-MM]'|'present'}" : spec.type === "month" ? "'YYYY[-MM]'" : spec.type
      return `${spec.key}${spec.required ? "*" : ""} (${type}, ${where})`
    })
    return `- ${kind}: ${parts.join(", ")}`
  }).join("\n")
}

/** Like cleanFields, but drops values that don't fit instead of failing (imports, AI output). */
export function looseFields(kind: EntryKind, raw: unknown): EntryFields {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const out: EntryFields = {}
  for (const spec of KIND_FIELDS[kind]) {
    if (spec.translated) continue
    let value = input[spec.key]
    // Accept dates as written on a CV ("Mar 2023 – Jan 2025", "avril 2026").
    if (typeof value === "string" && (spec.type === "dates" || (spec.type === "month" && !/^\d{4}(-\d{2})?$/.test(value.trim())))) {
      const parsed = parseDateRange(value)
      value = parsed ? (spec.type === "dates" ? fromRange(parsed) : fromMonthYear(parsed.start)) : undefined
    }
    try {
      Object.assign(out, cleanFields(kind, { [spec.key]: value }))
    } catch {
      // not a valid value for this field: leave it empty for the person to fill
    }
  }
  return out
}

/** AI/import shape of one entry's fields: text in one language plus shared fields. */
export const importedFieldsSchema = z.object({
  text: z.record(z.string(), z.string()).default({}).describe("Per-language fields of this kind, in the source language."),
  fields: z.record(z.string(), z.union([z.string(), z.object({ start: z.string().optional(), end: z.string().optional() })])).default({}).describe("Shared fields of this kind."),
})

/* ------------------------------------------------------------------ legacy */

export type LegacyDisplay = { role?: string; organization?: string; dates?: string; location?: string; label?: string }

const EMPLOYMENT_HINTS: [RegExp, string][] = [
  [/freelance|ind[ée]pendant|self-employed/i, "freelance"],
  [/altern|apprenti/i, "apprenticeship"],
  [/\b(stage|stagiaire|intern|internship|pfe)\b/i, "internship"],
  [/\b(cdd|fixed[- ]term|contract)\b/i, "fixed_term"],
  [/\b(part[- ]time|temps partiel)\b/i, "part_time"],
  [/\b(volunteer|b[ée]n[ée]vol)/i, "volunteer"],
]
const SUFFIX = /\s+(?:--|—|–|-|·|\|)\s+[^-—–|·]*\b(?:freelance|stage|internship|alternance|apprenticeship|cdd|part[- ]time)\b[^-—–|·]*$/i

/**
 * Convert the old role/organization/dates shape (markdown pools, LinkedIn
 * exports) into a kind's own fields. `name` is a label for the entry when the
 * display has none (e.g. "Pocket Planner — budget app").
 */
export function fromLegacy(kind: EntryKind, name: string, legacy: Record<string, LegacyDisplay>): { display: EntryText; fields: EntryFields } {
  const langs = Object.keys(legacy).length ? Object.keys(legacy) : ["en"]
  const first = (key: keyof LegacyDisplay) => langs.map((lang) => legacy[lang]?.[key]?.trim()).find(Boolean) ?? ""
  const [lead, ...rest] = name.split(/\s+—\s+/)
  const per = (map: Record<string, keyof LegacyDisplay | ((value: LegacyDisplay) => string | undefined)>) =>
    Object.fromEntries(langs.map((lang) => [lang, Object.fromEntries(Object.entries(map).map(([key, source]) => [key, (typeof source === "function" ? source(legacy[lang] ?? {}) : legacy[lang]?.[source])?.trim() ?? ""]).filter(([, value]) => value))]).filter(([, values]) => Object.keys(values).length))
  const dates = first("dates")
  const raw: Record<string, unknown> = {}
  let display: EntryText = {}
  switch (kind) {
    case "experience": {
      const role = first("role")
      raw.company = first("organization")
      raw.dates = dates
      raw.employment = EMPLOYMENT_HINTS.find(([pattern]) => pattern.test(role))?.[1]
      display = per({ position: (value) => value.role?.replace(SUFFIX, ""), location: "location" })
      break
    }
    case "education":
      raw.school = first("organization")
      raw.dates = dates
      display = per({ degree: "role", location: "location" })
      break
    case "project":
      raw.name = rest.length ? lead : first("role") || name
      raw.dates = dates
      display = rest.length ? { [langs[0]]: { tagline: rest.join(" — ") } } : {}
      break
    case "skill":
      display = per({ name: (value) => value.label || value.role })
      if (!Object.keys(display).length) display = { [langs[0]]: { name: name.replace(/^(comp[ée]tences|skills)\s*[—–-]\s*/i, "") } }
      break
    case "certification":
      raw.name = first("role") || (rest.length ? rest.join(" — ") : name)
      raw.issuer = first("organization") || (rest.length ? lead : "")
      raw.issued = dates
      break
    case "language":
      display = per({ language: (value) => value.label || value.role })
      if (!Object.keys(display).length) display = { [langs[0]]: { language: name } }
      break
    case "achievement":
      raw.issuer = first("organization")
      raw.date = dates
      display = per({ title: "role" })
      if (!Object.keys(display).length) display = { [langs[0]]: { title: name } }
      break
    default:
      raw.dates = dates
      display = per({ title: (value) => value.role || value.label, subtitle: "organization" })
      if (!Object.keys(display).length) display = { [langs[0]]: { title: name } }
  }
  return { display: cleanText(kind, display), fields: looseFields(kind, raw) }
}

/* ------------------------------------------------------------------ drafts */

/** Names a model (or a person) commonly uses for a field, tried when the kind has no field by that name. */
const FIELD_ALIASES: Record<string, string[]> = {
  position: ["role", "jobTitle", "job_title", "poste"],
  company: ["organization", "organisation", "employer", "companyName", "company_name", "entreprise"],
  school: ["institution", "university", "college", "ecole", "école"],
  issuer: ["organization", "organisation", "authority", "provider"],
  url: ["link", "website", "href", "site"],
  subtitle: ["description", "summary", "details", "tagline"],
  tagline: ["description", "summary", "subtitle"],
  context: ["description", "details"],
  level: ["proficiency"],
  date: ["dates", "when"],
  dates: ["period", "duration", "date"],
}
/** Generic names for an entry's own name: they mean the kind's required field. */
const NAME_ALIASES = ["name", "title", "label", "heading"]
const LANGS = ["en", "fr"] as const

/** A per-language bundle the model sent as JSON text ('{"title": "…"}'). */
function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null } catch { return null }
  }
  return null
}

function resolveKey(kind: EntryKind, key: string): string | null {
  const specs = KIND_FIELDS[kind]
  if (specs.some((spec) => spec.key === key)) return key
  const loose = key.toLowerCase().replace(/[\s_-]/g, "")
  const exact = specs.find((spec) => spec.key.toLowerCase() === loose)
  if (exact) return exact.key
  if (NAME_ALIASES.includes(loose)) return specs.find((spec) => spec.required)?.key ?? null
  for (const spec of specs) if (FIELD_ALIASES[spec.key]?.some((alias) => alias.toLowerCase().replace(/[\s_-]/g, "") === loose)) return spec.key
  if (["start", "startdate", "from", "end", "enddate", "to"].includes(loose) && specs.some((spec) => spec.key === "dates")) return "dates"
  return null
}

export type EntryDraft = {
  /** Per-language fields, by CV language. */
  display: Record<string, Record<string, string>>
  /** Shared fields, raw (dates may still be text). */
  fields: Record<string, unknown>
  /** Keys that match no field of this kind. */
  unknown: string[]
}

/**
 * Sorts what a model proposes for an entry into the kind's real fields. It
 * accepts the shapes models actually send: text keyed by language
 * ({en: {...}, fr: {...}}, even as JSON text), per-language fields put under
 * fields and shared ones under text, common synonyms ("name" for an "other"
 * entry's title, "role" for a position) and dates split into start and end.
 * Empty strings are kept so an edit can clear a field.
 */
export function normalizeEntryDraft(kind: EntryKind, language: string, text: unknown, fields: unknown): EntryDraft {
  const draft: EntryDraft = { display: {}, fields: {}, unknown: [] }
  const put = (lang: string, key: string, value: unknown) => {
    if (value === undefined || value === null) return
    const target = resolveKey(kind, key)
    if (!target) { if (!draft.unknown.includes(key)) draft.unknown.push(key); return }
    const spec = KIND_FIELDS[kind].find((item) => item.key === target)!
    const loose = key.toLowerCase().replace(/[\s_-]/g, "")
    if (spec.translated) {
      const value_ = typeof value === "string" ? value : typeof value === "number" ? String(value) : ""
      const bucket = (draft.display[lang] ??= {})
      if (!(target in bucket) || target === key) bucket[target] = value_.trim()
      return
    }
    if (spec.type === "dates" && target !== key && ["start", "startdate", "from", "end", "enddate", "to"].includes(loose)) {
      const range = (asObject(draft.fields.dates) ?? {}) as Record<string, unknown>
      range[/^(start|startdate|from)$/.test(loose) ? "start" : "end"] = value
      draft.fields.dates = range
      return
    }
    // A shared field given in several languages keeps its first value.
    if (!(target in draft.fields) || target === key) draft.fields[target] = typeof value === "string" ? value.trim() : value
  }
  const read = (source: unknown) => {
    for (const [key, value] of Object.entries(asObject(source) ?? {})) {
      const bundle = (LANGS as readonly string[]).includes(key) ? asObject(value) : null
      if (bundle) for (const [inner, innerValue] of Object.entries(bundle)) put(key, inner, innerValue)
      else if ((LANGS as readonly string[]).includes(key) && (value === "" || value == null)) continue
      else put(language, key, value)
    }
  }
  read(text)
  read(fields)
  return draft
}
