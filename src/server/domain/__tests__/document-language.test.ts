import assert from "node:assert/strict"
import test from "node:test"
import { keepCvLanguage } from "../../documents/language"
import { checkLetter, composeLetter } from "../../documents/letter"
import type { CvDocument } from "../../documents/model"

const french = "Contribution à des tâches d'automatisation et de reporting en Python."
const bullet = (id: string, text: string, extra: Partial<CvDocument["sections"][number]["items"][number]["bullets"][number]> = {}) => ({ id, text, source: "phrasing" as const, phrasingId: id, factIds: ["f"], included: true, ...extra })
const cv = (): CvDocument => ({
  version: 1, language: "en", template: "classic", accent: "#2563eb",
  header: { name: "Alex Doe", headline: "Nurse", summary: "Infirmier avec une expérience dans les soins et la formation des équipes.", summaryOriginal: "Nurse with experience in care and in training new staff.", email: "a@x.io", phone: "", location: "", links: [], photoPath: null, showPhoto: false },
  sections: [{
    id: "experience", kind: "experience", title: "Experience", included: true, groups: [],
    items: [
      { entryId: "a", title: "Nurse", organization: "Hospital", dates: "", location: "", logoPath: null, included: true, bullets: [bullet("a1", "Cared for 30 patients per shift."), bullet("a2", french), bullet("a3", french, { source: "model", originalText: "Contributed to automation and reporting in Python." })] },
      { entryId: "b", title: "Intern", organization: "Clinic", dates: "", location: "", logoPath: null, included: true, bullets: [bullet("b1", french)] },
    ],
  }],
  missingTranslations: [],
})

test("a generated CV loses every line in another language; rewrites go back to wording in the right one", () => {
  const { doc, removed } = keepCvLanguage(cv())
  assert.equal(removed, 4)
  assert.deepEqual(doc.sections[0].items.map((item) => item.entryId), ["a"])
  assert.deepEqual(doc.sections[0].items[0].bullets.map((b) => [b.text, b.source]), [["Cared for 30 patients per shift.", "phrasing"], ["Contributed to automation and reporting in Python.", "phrasing"]])
  assert.equal(doc.header.summary, "Nurse with experience in care and in training new staff.")
  assert.deepEqual(doc.missingTranslations.map((m) => m.entryId), ["b"])
})

test("a CV already in one language is returned untouched", () => {
  const clean = keepCvLanguage(cv()).doc
  assert.equal(keepCvLanguage(clean).doc, clean)
})

test("a cover letter paragraph in another language fails the letter's language check", () => {
  const profile = { fullName: "Alex Doe", headlines: { en: "Nurse" }, email: "a@x.io", phone: "", location: "Lyon", links: [], photoPath: null, defaultLanguage: "en" }
  const letter = composeLetter(profile, [], null, { title: "Nurse", company: "Northwind Clinic", location: "Lyon" }, { language: "en", maxHighlights: 0 })
  const status = (doc: typeof letter) => checkLetter(doc, 1).checks.find((check) => check.id === "language")?.status
  assert.equal(status(letter), "pass")
  letter.paragraphs = letter.paragraphs.map((p) => (p.kind === "motivation" ? { ...p, text: "Je souhaite rejoindre Northwind Clinic pour le soin apporté aux patients et à la formation des équipes.", placeholder: false } : p))
  assert.equal(status(letter), "fail")
})
