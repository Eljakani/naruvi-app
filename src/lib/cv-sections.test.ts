import assert from "node:assert/strict"
import { test } from "node:test"
import { sectionKind, splitForReading, splitSections } from "./cv-sections"

test("sections: titles in several languages, with their kind", () => {
  const cases: [string, string | null][] = [
    ["EXPÉRIENCES PROFESSIONNELLES", "experience"], ["Berufserfahrung", "experience"], ["Trayectoria", "experience"], ["الخبرة المهنية", "experience"],
    ["Formation", "education"], ["Estudios", "education"], ["Ausbildung", "education"], ["التعليم", "education"],
    ["Skills & Tools", "skill"], ["Kenntnisse", "skill"], ["Langues", "language"], ["Sprachen", "language"], ["اللغات", "language"],
    ["Licenses & Certifications", "certification"], ["Weiterbildung", "certification"], ["Charlas y eventos", "event"], ["Talks & Conferences", "event"],
    ["Centres d'intérêt", "interest"], ["Sobre mí", "summary"], ["Engagements", "volunteer"],
    // Content, not titles.
    ["Languages: Go, Python, SQL", null], ["• Skills", null], ["Experience 2019", null], ["Led the migration of the ledger service to an event-sourced design", null],
  ]
  for (const [line, kind] of cases) assert.equal(sectionKind(line), kind, line)
})

test("sections: the header, each section, and a title in capitals this module has no word for", () => {
  const { header, sections } = splitSections("Ana Silva\nProduct Designer\n\nWHAT I DO BEST\nDesign: Figma, Sketch\n\nCareer\nDesigner — Klarna\n2021 – Present\n\nIdiomas\nEspañol (nativo)")
  assert.deepEqual(header.filter(Boolean), ["Ana Silva", "Product Designer"])
  assert.deepEqual(sections.map((section) => [section.kind, section.title, section.lines.length]), [["other", "WHAT I DO BEST", 1], ["experience", "Career", 2], ["language", "Idiomas", 1]])
})

test("sections: a long CV is cut at section borders, a long section between its entries, with its title repeated", () => {
  const job = (n: number) => `Engineer ${n} — Company ${n}\n2010 – 2012\n• ${"Did measurable work. ".repeat(12)}`
  const text = `Ana Silva\nana@example.org\n\nExperience\n${Array.from({ length: 8 }, (_, n) => job(n)).join("\n\n")}\n\nEducation\nBSc — Leeds, 2005 – 2008`
  const parts = splitForReading(text, 1200)
  assert.ok(parts.length >= 3)
  assert.ok(parts.every((part) => part.length <= 1200))
  assert.ok(parts.slice(1, -1).every((part) => part.startsWith("Experience")))
  for (let n = 0; n < 8; n += 1) assert.equal(parts.filter((part) => part.includes(`Engineer ${n} —`)).length, 1)
  assert.deepEqual(splitForReading("short", 1200), ["short"])
})
