import assert from "node:assert/strict"
import test from "node:test"
import { composeCv, type ComposeEntry } from "../../documents/compose"

const profile = { fullName: "Alex Doe", headlines: { en: "Registered Nurse", fr: "Infirmier" }, email: "a@x.io", phone: "+1", location: "Lyon", links: [], photoPath: null, defaultLanguage: "en" }
const g = { grounded: true }
const entry = (id: string, kind: string, extra: Partial<ComposeEntry> = {}): ComposeEntry => ({
  id,
  kind,
  status: "verified",
  title: id,
  display: { en: { role: `${id} role`, organization: `${id} org`, dates: "2024" } },
  skills: [],
  logoPath: null,
  sortOrder: 0,
  facts: [],
  phrasings: [],
  ...extra,
})

const hospital = entry("hospital", "experience", {
  sortOrder: 0,
  facts: [{ id: "f1", statement: "Cared for 30 patients per shift." }, { id: "f2", statement: "Trained 5 new nurses." }],
  phrasings: [
    { id: "p1", group: "Care", role: "bullet", language: "en", text: "Cared for **30 patients** per shift using Epic.", factIds: ["f1"], grounding: g },
    { id: "p2", group: "Team", role: "bullet", language: "en", text: "Trained 5 new nurses.", factIds: ["f2"], grounding: g },
    { id: "p3", group: "Care", role: "bullet", language: "en", text: "Claimed 99 things.", factIds: [], grounding: { grounded: false } },
    { id: "p4", group: "Care", role: "bullet", language: "fr", text: "Prise en charge de 30 patients.", factIds: ["f1"], grounding: g },
  ],
})

test("uses only grounded, approved phrasings in the target language", () => {
  const cv = composeCv(profile, [hospital], null, { language: "en" })
  const bullets = cv.sections[0].items[0].bullets
  assert.deepEqual(bullets.map((b) => b.text), ["Cared for 30 patients per shift using Epic.", "Trained 5 new nurses."])
  assert.ok(bullets.every((b) => b.factIds.length > 0))
  assert.equal(cv.header.headline, "Registered Nurse")
  assert.equal(cv.sections[0].title, "Experience")
})

test("orders bullets by the analysis and over-supplies excluded alternatives", () => {
  const analysis = { requirements: [{ kind: "must", status: "met", keywords: [], factIds: ["f2"] }], recommendedEntries: [{ entryId: "hospital", requirements: 1 }], keywords: [] }
  const cv = composeCv(profile, [hospital], analysis, { language: "en", bulletsTop: 1 })
  const bullets = cv.sections[0].items[0].bullets
  assert.equal(bullets[0].text, "Trained 5 new nurses.")
  assert.deepEqual(bullets.map((b) => b.included), [true, false])
})

test("never mixes languages: entries without wording in that language are reported", () => {
  const cv = composeCv(profile, [hospital, entry("school", "education", { facts: [{ id: "s1", statement: "BSc Nursing" }] })], null, { language: "fr" })
  assert.equal(cv.sections[0].title, "Expérience professionnelle")
  assert.deepEqual(cv.sections[0].items[0].bullets.map((b) => b.text), ["Prise en charge de 30 patients."])
  assert.deepEqual(cv.missingTranslations.map((m) => m.entryId), ["school"])
})

test("unverified entries never appear; facts are a fallback only in the profile language", () => {
  const draft = entry("draft", "experience", { status: "needs_review", facts: [{ id: "d", statement: "Did a thing." }] })
  const factsOnly = entry("shop", "experience", { sortOrder: 1, facts: [{ id: "s", statement: "Managed the till." }] })
  const cv = composeCv(profile, [draft, factsOnly], null, { language: "en" })
  assert.deepEqual(cv.sections[0].items.map((i) => i.entryId), ["shop"])
  assert.equal(cv.sections[0].items[0].bullets[0].source, "fact")
})

test("headline never falls back to another language", () => {
  const cv = composeCv({ ...profile, headlines: { en: "Registered Nurse" } }, [hospital], null, { language: "fr" })
  assert.equal(cv.header.headline, "")
})
