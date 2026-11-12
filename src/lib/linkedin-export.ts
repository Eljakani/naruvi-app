/**
 * LinkedIn's "Get a copy of your data" export (ZIP of CSV files) turned into
 * profile entries. Pure and exact: no AI, nothing added that isn't in the
 * files. Everything still arrives as "needs review".
 */
import { looseFields, type EntryFields } from "@/lib/entry-fields"

export type ExportEntry = {
  kind: "experience" | "education" | "project" | "skill" | "certification" | "language" | "achievement"
  /** Per-language fields of the kind, in the export's language. */
  text: Record<string, string>
  fields: EntryFields
  facts: string[]
  skills: string[]
  bullets: { text: string; facts: number[] }[]
  dropped: number
}
/** LinkedIn's proficiency wording, as CEFR. */
const LEVELS: [RegExp, string][] = [[/native|bilingual/i, "native"], [/full professional/i, "C1"], [/professional working/i, "B2"], [/limited working/i, "B1"], [/elementary/i, "A2"]]

export type ExportIdentity = { fullName: string; headline: string; email: string; phone: string; location: string; links: { label: string; url: string }[] }

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const source = text.replace(/^﻿/, "")
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  // Some exports start with a "Notes:" preamble before the header row.
  const headerIndex = rows.findIndex((cells) => !/^notes:?/i.test(cells[0] ?? "") && cells.some((cell) => cell.trim()) && cells.every((cell) => cell.length < 60))
  if (headerIndex < 0) return []
  const header = rows[headerIndex].map((cell) => cell.trim())
  return rows
    .slice(headerIndex + 1)
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) => Object.fromEntries(header.map((name, index) => [name, (cells[index] ?? "").trim()])))
}

const span = (start = "", end = "") => (start || end ? `${start || "?"} – ${end || "Present"}` : "")

/** A description becomes facts: one per line or bullet, long paragraphs split into sentences. */
export function descriptionFacts(text: string): string[] {
  const lines = text
    .split(/\r?\n|(?:^|\s)[•▪◦●■–-]\s+/)
    .map((line) => line.replace(/^[\s•▪◦●■*–-]+/, "").trim())
    .filter((line) => line.length >= 3)
  const facts = lines.flatMap((line) => (line.length > 300 ? line.split(/(?<=[.!?])\s+(?=\p{Lu})/u) : [line])).map((line) => line.trim()).filter((line) => line.length >= 3)
  return facts.slice(0, 30).map((fact) => fact.slice(0, 600))
}

const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))

/** Rough language of the person's own text, so the profile keeps it. */
export function guessLanguage(text: string): string {
  const words = text.toLowerCase().split(/[^\p{L}]+/u)
  const score = (list: string[]) => words.filter((word) => list.includes(word)).length
  const counts = { en: score(["the", "and", "with", "for", "of", "to"]), fr: score(["le", "la", "les", "et", "des", "avec", "pour", "du"]), de: score(["der", "die", "und", "mit", "für", "das"]), es: score(["el", "los", "las", "y", "con", "para", "del"]) }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 2 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : "en"
}

/** File names are matched loosely ("Positions.csv", "positions (1).csv"). */
export function linkedinImport(files: Record<string, string>) {
  const pick = (name: string) => {
    const key = Object.keys(files).find((file) => file.toLowerCase().replace(/.*\//, "").replace(/\s*\(\d+\)/, "") === `${name.toLowerCase()}.csv`)
    return key ? parseCsv(files[key]) : []
  }
  const profile = pick("Profile")[0] ?? {}
  const email = pick("Email Addresses").find((row) => row.Primary === "Yes")?.["Email Address"] ?? pick("Email Addresses")[0]?.["Email Address"] ?? ""
  const phone = pick("PhoneNumbers")[0]?.Number ?? ""
  const links = (profile.Websites ?? "")
    .replace(/^\[|\]$/g, "")
    .split(/,(?=[A-Z]+:)/)
    .map((item) => item.match(/^([A-Z]+):(https?:\/\/\S+)$/))
    .filter(Boolean)
    .map((match) => ({ label: match![1][0] + match![1].slice(1).toLowerCase(), url: match![2] }))
    .slice(0, 10)
  const identity: ExportIdentity = { fullName: [profile["First Name"], profile["Last Name"]].filter(Boolean).join(" "), headline: profile.Headline ?? "", email, phone, location: profile["Geo Location"] ?? "", links }

  const entries: ExportEntry[] = []
  const base = { skills: [] as string[], bullets: [] as { text: string; facts: number[] }[], dropped: 0 }
  const push = (kind: ExportEntry["kind"], text: Record<string, string | undefined>, fields: Record<string, unknown>, facts: string[] = [], skills: string[] = []) =>
    entries.push({ ...base, kind, text: Object.fromEntries(Object.entries(text).filter((pair): pair is [string, string] => Boolean(pair[1]?.trim()))), fields: looseFields(kind, fields), facts, skills })
  for (const row of pick("Positions")) {
    if (!row.Title && !row["Company Name"]) continue
    push("experience", { position: row.Title, location: row.Location }, { company: row["Company Name"], dates: span(row["Started On"], row["Finished On"]) }, descriptionFacts(row.Description ?? ""))
  }
  for (const row of pick("Education")) {
    if (!row["School Name"]) continue
    push("education", { degree: row["Degree Name"] }, { school: row["School Name"], dates: span(row["Start Date"], row["End Date"]) }, descriptionFacts([row.Notes, row.Activities].filter(Boolean).join("\n")))
  }
  for (const row of pick("Projects")) {
    if (!row.Title) continue
    push("project", {}, { name: row.Title, url: row.Url, dates: span(row["Started On"], row["Finished On"]) }, descriptionFacts(row.Description ?? ""))
  }
  for (const row of pick("Certifications")) {
    if (!row.Name) continue
    push("certification", {}, { name: row.Name, issuer: row.Authority, issued: row["Started On"], expires: row["Finished On"], credentialId: row["License Number"], url: row.Url })
  }
  for (const row of pick("Honors")) {
    if (!row.Title) continue
    push("achievement", { title: row.Title }, { date: row["Issued On"] }, descriptionFacts(row.Description ?? ""))
  }
  const skills = [...new Set(pick("Skills").map((row) => row.Name).filter(Boolean))]
  chunk(skills, 40).forEach((group, index) => push("skill", { name: index ? `LinkedIn skills (${index + 1})` : "LinkedIn skills" }, {}, [], group))
  for (const row of pick("Languages").filter((row) => row.Name)) push("language", { language: row.Name }, { level: LEVELS.find(([pattern]) => pattern.test(row.Proficiency ?? ""))?.[1] })

  const sample = [profile.Summary, ...pick("Positions").map((row) => row.Description)].filter(Boolean).join(" ")
  return { language: guessLanguage(sample), identity, entries, found: entries.length > 0 || Boolean(identity.fullName) }
}
