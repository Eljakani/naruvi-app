/**
 * LinkedIn's "Get a copy of your data" export (ZIP of CSV files) turned into
 * profile entries. Pure and exact: no AI, nothing added that isn't in the
 * files. Everything still arrives as "needs review".
 */
export type ExportEntry = {
  kind: "experience" | "education" | "project" | "skill" | "certification" | "language" | "achievement"
  title: string
  display: { role: string; organization: string; dates: string; location: string }
  facts: string[]
  skills: string[]
  bullets: { text: string; facts: number[] }[]
  dropped: number
}
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
  for (const row of pick("Positions")) {
    if (!row.Title && !row["Company Name"]) continue
    entries.push({ ...base, kind: "experience", title: [row["Company Name"], row.Title].filter(Boolean).join(" — "), display: { role: row.Title ?? "", organization: row["Company Name"] ?? "", dates: span(row["Started On"], row["Finished On"]), location: row.Location ?? "" }, facts: descriptionFacts(row.Description ?? "") })
  }
  for (const row of pick("Education")) {
    if (!row["School Name"]) continue
    entries.push({ ...base, kind: "education", title: [row["School Name"], row["Degree Name"]].filter(Boolean).join(" — "), display: { role: row["Degree Name"] ?? "", organization: row["School Name"], dates: span(row["Start Date"], row["End Date"]), location: "" }, facts: descriptionFacts([row.Notes, row.Activities].filter(Boolean).join("\n")) })
  }
  for (const row of pick("Projects")) {
    if (!row.Title) continue
    entries.push({ ...base, kind: "project", title: row.Title, display: { role: "", organization: "", dates: span(row["Started On"], row["Finished On"]), location: "" }, facts: descriptionFacts(row.Description ?? "") })
  }
  for (const row of pick("Certifications")) {
    if (!row.Name) continue
    entries.push({ ...base, kind: "certification", title: row.Name, display: { role: "", organization: row.Authority ?? "", dates: row["Started On"] ?? "", location: "" }, facts: [] })
  }
  for (const row of pick("Honors")) {
    if (!row.Title) continue
    entries.push({ ...base, kind: "achievement", title: row.Title, display: { role: "", organization: "", dates: row["Issued On"] ?? "", location: "" }, facts: descriptionFacts(row.Description ?? "") })
  }
  const skills = [...new Set(pick("Skills").map((row) => row.Name).filter(Boolean))]
  chunk(skills, 40).forEach((group, index) => entries.push({ ...base, kind: "skill", title: index ? `Skills from LinkedIn (${index + 1})` : "Skills from LinkedIn", display: { role: "", organization: "", dates: "", location: "" }, facts: [], skills: group }))
  const languages = pick("Languages").filter((row) => row.Name).map((row) => (row.Proficiency ? `${row.Name} (${row.Proficiency.replace(/ proficiency$/i, "")})` : row.Name))
  if (languages.length) entries.push({ ...base, kind: "language", title: "Languages", display: { role: "", organization: "", dates: "", location: "" }, facts: [], skills: languages.slice(0, 40) })

  const sample = [profile.Summary, ...pick("Positions").map((row) => row.Description)].filter(Boolean).join(" ")
  return { language: guessLanguage(sample), identity, entries, found: entries.length > 0 || Boolean(identity.fullName) }
}
