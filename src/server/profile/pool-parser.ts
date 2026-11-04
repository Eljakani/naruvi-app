/**
 * Parser for the Markdown profile pools used by the my-cv repository.
 * Pure: text in, structured record out. Unknown sections are kept as facts so
 * nothing the user wrote is silently dropped.
 */
import type { EntryDisplay } from "@/server/db/schema"

export type ParsedEntry = {
  key: string
  kind: "experience" | "education" | "project" | "skill" | "certification" | "language" | "achievement" | "other"
  status: "verified" | "needs_review"
  title: string
  display: Record<string, EntryDisplay>
  tags: string[]
  skills: string[]
  facts: string[]
  phrasings: { group: string; language: string; text: string; role: "bullet" | "label" }[]
  evidence: string[]
  doNotClaim: string[]
  confidential: boolean
}

export type ParsedIdentity = {
  fullName: string
  email: string
  phone: string
  location: string
  availability: string
  links: { label: string; url: string }[]
  locked: string[]
}

const KIND: Record<string, ParsedEntry["kind"]> = {
  experience: "experience",
  education: "education",
  project: "project",
  skill: "skill",
  "skill cluster": "skill",
  certification: "certification",
  languages: "language",
  language: "language",
  achievement: "achievement",
}

const LANG: Record<string, string> = { english: "en", french: "fr", anglais: "en", "français": "fr", francais: "fr" }
const DISPLAY_KEYS: Record<string, keyof EntryDisplay> = {
  role: "role",
  title: "role",
  degree: "role",
  name: "label",
  organization: "organization",
  school: "organization",
  issuer: "organization",
  dates: "dates",
  date: "dates",
  location: "location",
  label: "label",
}

type Section = { heading: string; sub: string; lines: string[] }

function sections(markdown: string) {
  const header: string[] = []
  const out: Section[] = []
  let current: Section | null = null
  let title = ""
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (/^#\s+/.test(line) && !title) title = line.replace(/^#\s+/, "").trim()
    else if (/^##\s+/.test(line)) {
      current = { heading: line.replace(/^##\s+/, "").trim(), sub: "", lines: [] }
      out.push(current)
    } else if (/^###\s+/.test(line) && current) {
      current = { heading: current.heading, sub: line.replace(/^###\s+/, "").trim(), lines: [] }
      out.push(current)
    } else if (current) current.lines.push(line)
    else header.push(line)
  }
  return { title, header, sections: out }
}

const bullets = (lines: string[]) =>
  lines
    .map((line) => line.match(/^\s*[-*+]\s+(.*)$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/^`(.+)`$/, "$1"))

const keyValues = (lines: string[]) =>
  lines
    .map((line) => line.match(/^\s*([A-Za-zÀ-ÿ ]{2,30}):\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1].trim().toLowerCase(), match[2].trim()] as const)

const csv = (value = "") =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

export function parsePool(markdown: string, fallbackKey: string): ParsedEntry {
  const doc = sections(markdown)
  const meta = Object.fromEntries(keyValues(doc.header))
  const statusRaw = String(meta.status ?? "").toLowerCase()
  const entry: ParsedEntry = {
    key: meta.id || fallbackKey,
    kind: KIND[String(meta.type ?? "").toLowerCase()] ?? "other",
    status: /^(verified|current)/.test(statusRaw) ? "verified" : "needs_review",
    title: doc.title || meta.id || fallbackKey,
    display: {},
    tags: csv(meta.tags),
    skills: [],
    facts: [],
    phrasings: [],
    evidence: [],
    doNotClaim: [],
    confidential: /nda|confidential/.test(statusRaw),
  }

  for (const section of doc.sections) {
    const heading = section.heading.toLowerCase()
    if (heading === "display") {
      const lang = LANG[section.sub.toLowerCase()] ?? (section.sub ? null : "neutral")
      if (lang === null) continue
      const target = (entry.display[lang] ??= {})
      for (const [key, value] of keyValues(section.lines)) {
        const field = DISPLAY_KEYS[key]
        if (field) target[field] = value
      }
      entry.facts.push(...bullets(section.lines))
    } else if (heading === "truth source") entry.facts.push(...bullets(section.lines))
    else if (/approved .*variants|approved cluster labels|cv labels/.test(heading)) {
      for (const text of bullets(section.lines)) {
        const match = text.match(/^\[([a-z]{2})\]\s*(.+)$/i)
        const language = match ? match[1].toLowerCase() : "en"
        const role = /labels?$/i.test(section.heading) ? "label" : "bullet"
        entry.phrasings.push({ group: section.sub || section.heading, language, text: (match ? match[2] : text).trim(), role })
      }
    } else if (heading === "skills") entry.skills.push(...bullets(section.lines))
    else if (/^evidence/.test(heading)) entry.evidence.push(...bullets(section.lines))
    else if (heading === "do not claim") entry.doNotClaim.push(...bullets(section.lines))
    else entry.facts.push(...bullets(section.lines).map((item) => (section.sub ? `${section.sub}: ${item}` : item)))
  }

  // A neutral display applies to every language that has no own value.
  const neutral = entry.display.neutral
  if (neutral) {
    delete entry.display.neutral
    for (const lang of ["en", "fr"]) entry.display[lang] = { ...neutral, ...entry.display[lang] }
  }
  if (entry.doNotClaim.some((rule) => /\bNDA\b/.test(rule))) entry.confidential = true
  entry.facts = [...new Set(entry.facts)]
  return entry
}

export function parseIdentity(markdown: string): ParsedIdentity {
  const doc = sections(markdown)
  const all = Object.fromEntries(doc.sections.flatMap((section) => keyValues(section.lines)))
  const links = (["linkedin", "github", "website"] as const)
    .filter((key) => all[key])
    .map((key) => ({ label: key === "linkedin" ? "LinkedIn" : key === "github" ? "GitHub" : "Website", url: all[key] }))
  const lockedSection = doc.sections.find((section) => /do not change/i.test(section.heading))
  return {
    fullName: all.name ?? "",
    email: all.email ?? "",
    phone: all.phone ?? "",
    location: all.location ?? "",
    availability: all.availability ?? "",
    links,
    locked: lockedSection ? bullets(lockedSection.lines) : [],
  }
}
