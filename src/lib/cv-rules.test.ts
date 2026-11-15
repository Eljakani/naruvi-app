import assert from "node:assert/strict"
import { test } from "node:test"
import { dateIn, readCvWithRules, textLanguage } from "./cv-rules"

const cv = `Ana Silva
Backend Engineer · Leeds, United Kingdom
ana.silva@example.org · +44 7700 900123

Summary
Engineer with seven years in payments.

Experience
Senior Backend Engineer — Monzo, London (Remote)
Mar 2021 – Present
• Led the migration of the ledger service handling 4 million
transactions a day.
• Mentored 5 engineers.
Example Studio — Leeds
Developer — 2016 – 2018
• Built the booking site.
Intern (stage) — été 2015

Education
BSc Computer Science, University of Leeds — 2011 – 2015
First Class Honours

Skills
Languages: Go, Python, SQL
Infrastructure: Kubernetes, Terraform

Languages
English (native), French (B2), Welsh

Certifications
Certified Kubernetes Administrator (CKA), The Linux Foundation — 2023

Talks
“Ledgers at scale” — GopherCon UK 2022, London (speaker)

Projects
ledgerlite — double-entry ledger library. https://github.com/anasilva-dev/ledgerlite
`

test("rules reader: identity, summary and every section of a plain CV", () => {
  const result = readCvWithRules(cv)
  assert.equal(result.language, "en")
  assert.deepEqual({ ...result.identity, links: result.identity.links.length }, { fullName: "Ana Silva", headline: "Backend Engineer", summary: "Engineer with seven years in payments.", email: "ana.silva@example.org", phone: "+44 7700 900123", location: "Leeds, United Kingdom", links: 0 })
  const of = (kind: string) => result.entries.filter((entry) => entry.kind === kind)
  assert.deepEqual(of("experience").map((entry) => [entry.text.position, entry.fields.company, entry.text.location ?? "", entry.fields.dates, entry.facts.length]), [
    ["Senior Backend Engineer", "Monzo", "London", { start: "2021-03", end: "present" }, 2],
    ["Developer", "Example Studio", "Leeds", { start: "2016", end: "2018" }, 1],
    // Two jobs under one employer are two entries; a season is a year.
    ["Intern", "Example Studio", "Leeds", { start: "2015" }, 0],
  ])
  assert.equal(of("experience")[0].fields.workMode, "remote")
  assert.equal(of("experience")[0].facts[0], "Led the migration of the ledger service handling 4 million transactions a day.")
  assert.equal(of("experience")[2].fields.employment, "internship")
  assert.deepEqual(of("education").map((entry) => [entry.text.degree, entry.fields.school, entry.fields.dates, entry.facts]), [["BSc Computer Science", "University of Leeds", { start: "2011", end: "2015" }, ["First Class Honours"]]])
  assert.deepEqual(of("skill").map((entry) => [entry.text.name, entry.skills]), [["Languages", ["Go", "Python", "SQL"]], ["Infrastructure", ["Kubernetes", "Terraform"]]])
  assert.deepEqual(of("language").map((entry) => [entry.text.language, entry.fields.level]), [["English", "native"], ["French", "B2"], ["Welsh", undefined]])
  assert.equal(of("certification").length, 1)
  assert.equal(of("certification")[0].fields.issued, "2023")
  assert.match(String(of("certification")[0].fields.name), /Certified Kubernetes Administrator/)
  assert.deepEqual(of("event").map((entry) => [entry.text.title, entry.fields.event, entry.text.location, entry.fields.date, entry.fields.role]), [["Ledgers at scale", "GopherCon UK 2022", "London", "2022", "speaker"]])
  assert.deepEqual(of("project").map((entry) => [entry.fields.name, entry.fields.repo]), [["ledgerlite", "https://github.com/anasilva-dev/ledgerlite"]])
  // The summary is the person's, not an entry; a section title never becomes one.
  assert.equal(result.entries.some((entry) => /summary|experience|education/i.test(Object.values(entry.text).join(" "))), false)
  assert.deepEqual(result.unread, [])
})

test("rules reader: dates-first tables, German wording, labelled contact details", () => {
  const result = readCvWithRules(`Lebenslauf

Name   Jonas Reinhardt
E-Mail   jonas.reinhardt@example.de

Berufserfahrung

seit 04/2021   Entwicklungsingenieur
Siemens AG, München
- Leitung eines Teilprojekts mit 6 Ingenieuren
10/2017 – 03/2021   Konstrukteur
Robert Bosch GmbH, Stuttgart

Sprachen

Deutsch   Muttersprache
Englisch   verhandlungssicher`)
  assert.equal(result.language, "de")
  assert.equal(result.identity.fullName, "Jonas Reinhardt")
  assert.deepEqual(result.entries.filter((entry) => entry.kind === "experience").map((entry) => [entry.text.position, entry.fields.company, entry.text.location, entry.fields.dates]), [
    ["Entwicklungsingenieur", "Siemens AG", "München", { start: "2021-04", end: "present" }],
    ["Konstrukteur", "Robert Bosch GmbH", "Stuttgart", { start: "2017-10", end: "2021-03" }],
  ])
  assert.deepEqual(result.entries.filter((entry) => entry.kind === "language").map((entry) => [entry.text.language, entry.fields.level]), [["Deutsch", "native"], ["Englisch", "C1"]])
})

test("rules reader: what it can't place is reported, not dropped silently", () => {
  const result = readCvWithRules("Ana Silva\nana.silva@example.org\n\nA paragraph that belongs to no section and describes nothing in particular about work.\n\nSkills\nGo, Python")
  assert.deepEqual(result.unread, ["A paragraph that belongs to no section and describes nothing in particular about work."])
  assert.deepEqual(result.entries.map((entry) => [entry.kind, entry.skills]), [["skill", ["Go", "Python"]]])
})

test("dates inside a line, and the language of a text", () => {
  assert.equal(dateIn("BSc Computer Science, University of Leeds — 2011 – 2015")?.written, "2011 – 2015")
  assert.equal(dateIn("Stagiaire — été 2024")?.written, "2024")
  assert.equal(dateIn("seit 04/2021   Entwicklungsingenieur")?.written, "seit 04/2021")
  assert.equal(dateIn("Led a team of 12"), null)
  assert.equal(textLanguage("Chef de projet avec six ans d'expérience dans le conseil et la banque pour des clients"), "fr")
  assert.equal(textLanguage("مهندسة برمجيات في الدار البيضاء"), "ar")
})
