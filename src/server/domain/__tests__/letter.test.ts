import assert from "node:assert/strict"
import test from "node:test"
import type { ComposeEntry } from "../../documents/compose"
import { checkLetter, composeLetter, isPlaceholder } from "../../documents/letter"

const profile = { fullName: "Sam Lee", headlines: {}, email: "s@x.io", phone: "", location: "Lyon", links: [], photoPath: null, defaultLanguage: "en" }
const g = { grounded: true }
const shop: ComposeEntry = {
  id: "shop",
  kind: "experience",
  status: "verified",
  title: "Shop",
  display: { en: { role: "Store Manager", organization: "Fresh Market" }, fr: { role: "Responsable de magasin", organization: "Fresh Market" } },
  skills: [],
  logoPath: null,
  sortOrder: 0,
  facts: [{ id: "f1", statement: "Cut stock losses by 20%." }, { id: "f2", statement: "Managed a team of 12." }],
  phrasings: [
    { id: "p1", group: "Ops", role: "bullet", language: "en", text: "Cut stock losses by **20%** with weekly audits.", factIds: ["f1"], grounding: g },
    { id: "p2", group: "Team", role: "bullet", language: "en", text: "Managed a team of 12.", factIds: ["f2"], grounding: g },
    { id: "p3", group: "Ops", role: "bullet", language: "fr", text: "Réduction de 20 % des pertes de stock.", factIds: ["f1"], grounding: g },
    { id: "p4", group: "Ops", role: "bullet", language: "en", text: "Unbacked 99% claim.", factIds: [], grounding: { grounded: false } },
  ],
}
const analysis = {
  requirements: [
    { kind: "must", status: "met", keywords: [], factIds: ["f2"] },
    { kind: "must", status: "partial", keywords: [], factIds: ["f1"] },
    { kind: "must", status: "gap", keywords: [], factIds: [] },
  ],
  recommendedEntries: [],
  keywords: [],
}
const job = { title: "Retail Supervisor", company: "GreenGrocer" }

test("evidence comes only from grounded, approved bullets; proven first", () => {
  const letter = composeLetter(profile, [shop], analysis, job, { language: "en", today: new Date("2026-11-05") })
  assert.deepEqual(letter.highlights.map((h) => h.text), ["Managed a team of 12.", "Cut stock losses by 20% with weekly audits."])
  assert.equal(letter.subject, "Application for the Retail Supervisor position")
  assert.match(letter.paragraphs[0].text, /GreenGrocer/)
  assert.equal(letter.date, "5 November 2026")
})

test("localized, and highlights stay in the letter's language", () => {
  const letter = composeLetter(profile, [shop], analysis, job, { language: "fr", today: new Date("2026-11-05") })
  assert.equal(letter.salutation, "Madame, Monsieur,")
  assert.deepEqual(letter.highlights.map((h) => h.text), ["Réduction de 20 % des pertes de stock."])
  assert.equal(letter.date, "5 novembre 2026")
})

test("a new letter is complete without AI: no bracketed instruction, a real motivation", () => {
  const letter = composeLetter(profile, [shop], analysis, job, { language: "en" })
  const motivation = letter.paragraphs.find((paragraph) => paragraph.kind === "motivation")!
  assert.equal(isPlaceholder(motivation.text), false)
  assert.match(motivation.text, /GreenGrocer/)
  assert.equal(checkLetter(letter, 1).checks.find((c) => c.id === "placeholders")?.status, "pass")
})

test("placeholder blocks 'ready' until replaced", () => {
  const letter = composeLetter(profile, [shop], analysis, job, { language: "en" })
  letter.paragraphs[2] = { ...letter.paragraphs[2], text: "[Why GreenGrocer? In 2–3 sentences of your own, say what draws you.]" }
  assert.equal(isPlaceholder(letter.paragraphs[2].text), true)
  const draft = checkLetter(letter, 1)
  assert.equal(draft.ready, false)
  assert.equal(draft.checks.find((c) => c.id === "placeholders")?.status, "fail")
  letter.paragraphs[2] = { ...letter.paragraphs[2], text: "GreenGrocer's focus on local farms matches how I ran sourcing at Fresh Market, and I want to help grow it.", placeholder: false }
  const done = checkLetter(letter, 1)
  assert.equal(done.checks.find((c) => c.id === "placeholders")?.status, "pass")
  assert.equal(done.errors, 0)
})

test("two pages and ungrounded highlights are errors", () => {
  const letter = composeLetter(profile, [shop], analysis, job, { language: "en" })
  letter.highlights.push({ id: "x", text: "Invented.", organization: "", factIds: [], included: true })
  const report = checkLetter(letter, 2)
  assert.equal(report.checks.find((c) => c.id === "evidence")?.status, "fail")
  assert.equal(report.checks.find((c) => c.id === "pages")?.status, "fail")
})

test("an emptied motivation paragraph also blocks ready", () => {
  const letter = composeLetter(profile, [shop], analysis, job, { language: "en" })
  letter.paragraphs[2] = { ...letter.paragraphs[2], text: "  " }
  assert.equal(checkLetter(letter, 1).checks.find((c) => c.id === "placeholders")?.status, "fail")
})

test("an alternance letter says so, with its rhythm and start", () => {
  const letter = composeLetter(profile, [shop], analysis, { ...job, contract: "apprenticeship", programme: { duration: "24 mois", start: "septembre 2026", rhythm: "3 semaines / 1 semaine" } }, { language: "fr" })
  assert.equal(letter.subject, `Candidature en alternance au poste de ${job.title}`)
  assert.match(letter.paragraphs[0].text, /en alternance au sein de GreenGrocer, d’une durée de 24 mois, au rythme 3 semaines \/ 1 semaine, à partir de septembre 2026\.$/)
  const permanent = composeLetter(profile, [shop], analysis, { ...job, contract: "permanent" }, { language: "fr" })
  assert.match(permanent.paragraphs[0].text, /^Je vous adresse ma candidature au poste de/)
})
