import assert from "node:assert/strict"
import test from "node:test"
import { composeCv, type ComposeEntry } from "../../documents/compose"

const profile = { fullName: "Alex Doe", headlines: { en: "Registered Nurse", fr: "Infirmier" }, email: "a@x.io", phone: "+1", location: "Lyon", links: [], photoPath: null, defaultLanguage: "en" }
const g = { grounded: true }
const entry = (id: string, kind: string, extra: Partial<ComposeEntry> = {}): ComposeEntry => ({
  id,
  kind,
  status: "verified",
  display: kind === "experience" ? { en: { position: `${id} role` } } : kind === "project" ? { en: { tagline: `${id} tagline` } } : { en: { degree: `${id} role` } },
  fields: kind === "experience" ? { company: `${id} org`, dates: { start: "2024" } } : kind === "project" ? { name: `${id} role`, dates: { start: "2024" } } : { school: `${id} org`, dates: { start: "2024" } },
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
  const translated = { ...hospital, display: { en: { position: "Nurse" }, fr: { position: "Infirmier" } } }
  const cv = composeCv(profile, [translated, entry("school", "education", { facts: [{ id: "s1", statement: "BSc Nursing" }] })], null, { language: "fr" })
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

/* One language per document: nothing is borrowed from another language. */

const frenchFacts = (translations: boolean) => entry("lab", "experience", {
  display: { en: { position: "Cloud Intern" }, fr: { position: "Stagiaire cloud" } },
  facts: [
    { id: "l1", statement: "Contribution à des tâches d'automatisation et de reporting en Python.", translations: translations ? { en: { text: "Contributed to automation and reporting tasks in Python.", source: "Contribution à des tâches d'automatisation et de reporting en Python." } } : {} },
    { id: "l2", statement: "Travail sur la sécurité de la chaîne d'approvisionnement logicielle.", translations: translations ? { en: { text: "Worked on software supply chain security.", source: "Travail sur la sécurité de la chaîne d'approvisionnement logicielle." } } : {} },
  ],
})

test("facts written in another language than the profile's are printed in the document's language", () => {
  // Profile language is English, the entry's facts were typed in French and it has no approved bullets.
  const cv = composeCv(profile, [frenchFacts(true)], null, { language: "en" })
  assert.deepEqual(cv.sections[0].items[0].bullets.map((b) => b.text), ["Contributed to automation and reporting tasks in Python.", "Worked on software supply chain security."])
  assert.deepEqual(cv.sections[0].items[0].bullets.map((b) => b.factIds), [["l1"], ["l2"]])
})

test("facts in another language with no translation yet leave the entry out and report it", () => {
  const cv = composeCv(profile, [frenchFacts(false)], null, { language: "en" })
  assert.equal(cv.sections.length, 0)
  assert.deepEqual(cv.missingTranslations.map((m) => m.entryId), ["lab"])
})

test("a translation made from an older statement, or one that kept the original words, is not used", () => {
  const stale = entry("lab", "experience", { facts: [{ id: "l1", statement: "Travail sur la sécurité de la chaîne d'approvisionnement.", translations: { en: { text: "Worked on something else.", source: "Ancien texte." } } }] })
  assert.deepEqual(composeCv(profile, [stale], null, { language: "en" }).missingTranslations.map((m) => m.entryId), ["lab"])
  const untranslated = entry("lab", "experience", { facts: [{ id: "l1", statement: "Travail sur la sécurité de la chaîne d'approvisionnement.", translations: { en: { text: "Travail sur la sécurité de la chaîne d'approvisionnement.", source: "Travail sur la sécurité de la chaîne d'approvisionnement." } } }] })
  assert.deepEqual(composeCv(profile, [untranslated], null, { language: "en" }).missingTranslations.map((m) => m.entryId), ["lab"])
})

test("translated facts serve a document in a language other than the profile's", () => {
  const shop = entry("shop", "experience", { display: { en: { position: "Cashier" }, fr: { position: "Caissier" } }, facts: [{ id: "s", statement: "Managed the till for the weekend team.", translations: { fr: { text: "Gestion de la caisse pour l'équipe du week-end.", source: "Managed the till for the weekend team." } } }] })
  const cv = composeCv(profile, [shop], null, { language: "fr" })
  assert.deepEqual(cv.sections[0].items[0].bullets.map((b) => b.text), ["Gestion de la caisse pour l'équipe du week-end."])
  assert.equal(cv.sections[0].items[0].title, "Caissier")
})

test("a bullet filed under the document's language but written in another is not printed", () => {
  const mixed = entry("mixed", "experience", {
    facts: [{ id: "m1", statement: "Ran 12 audits." }, { id: "m2", statement: "Wrote the runbooks." }],
    phrasings: [
      { id: "q1", group: "Imported", role: "bullet", language: "en", text: "Réalisation de 12 audits pour les équipes de la région.", factIds: ["m1"], grounding: g },
      { id: "q2", group: "Imported", role: "bullet", language: "en", text: "Wrote the runbooks used by the on-call team.", factIds: ["m2"], grounding: g },
    ],
  })
  const cv = composeCv(profile, [mixed], null, { language: "en" })
  assert.deepEqual(cv.sections[0].items[0].bullets.map((b) => b.text), ["Wrote the runbooks used by the on-call team."])
})

test("titles, skill labels and spoken languages are never borrowed from another language", () => {
  const job = entry("job", "experience", { display: { fr: { position: "Développeuse", location: "Lyon, France" } }, phrasings: [{ id: "j1", group: "A", role: "bullet", language: "en", text: "Shipped the billing module.", factIds: ["jf"], grounding: g }], facts: [{ id: "jf", statement: "Shipped the billing module." }] })
  const skill = entry("tools", "skill", { display: { fr: { name: "Outils" } }, skills: ["Docker"] })
  const spoken = entry("spoken", "language", { display: { fr: { language: "Anglais" } }, fields: { level: "c1" } })
  const cv = composeCv(profile, [job, skill, spoken], null, { language: "en" })
  assert.equal(cv.sections.length, 0)
  assert.deepEqual(cv.missingTranslations.map((m) => m.entryId).sort(), ["job", "spoken", "tools"])
  const fr = composeCv(profile, [job, skill, spoken], null, { language: "fr" })
  assert.deepEqual(fr.sections.map((section) => section.kind), ["skills", "languages"])
})

test("a headline or summary filed under the wrong language is left blank", () => {
  const cv = composeCv({ ...profile, headlines: { en: "Ingénieure en sécurité des systèmes" }, summaries: { en: "Ingénieure avec une expérience dans la sécurité des applications et des réseaux." } }, [hospital], null, { language: "en" })
  assert.equal(cv.header.headline, "")
  assert.equal(cv.header.summary, "")
})
