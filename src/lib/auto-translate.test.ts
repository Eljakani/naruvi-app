import assert from "node:assert/strict"
import { test } from "node:test"
import { planTranslations, type PlanEntry, type PlanPhrasing } from "./auto-translate"

const LANGS = ["en", "fr"] as const
const line = (id: string, language: string, text: string, extra: Partial<PlanPhrasing> = {}): PlanPhrasing => ({ id, group: "General", role: "bullet", language, text, factIds: ["f1"], sortOrder: 0, autoText: null, autoSource: null, ...extra })
const entry = (extra: Partial<PlanEntry>): PlanEntry => ({ kind: "experience", display: {}, translations: {}, phrasings: [], ...extra })

test("a new entry in one language is translated into the other", () => {
  const plan = planTranslations(entry({ display: { fr: { position: "Infirmière", location: "Lyon" } }, phrasings: [line("a", "fr", "Formation de 6 infirmières")] }), LANGS, "en")
  assert.equal(plan.jobs.length, 1)
  assert.deepEqual([plan.jobs[0].from, plan.jobs[0].to, plan.jobs[0].text], ["fr", "en", { position: "Infirmière", location: "Lyon" }])
  assert.deepEqual(plan.jobs[0].lines.map((item) => [item.source.id, item.replaces]), [["a", null]])
})

test("an up-to-date machine translation needs nothing", () => {
  const plan = planTranslations(entry({
    display: { fr: { position: "Infirmière" }, en: { position: "Nurse" } },
    translations: { en: { position: { text: "Nurse", source: "Infirmière" } } },
    phrasings: [line("a", "fr", "Formation de 6 infirmières"), line("b", "en", "Trained 6 nurses", { autoText: "Trained 6 nurses", autoSource: "Formation de 6 infirmières" })],
  }), LANGS, "en")
  assert.deepEqual(plan, { jobs: [], clearFields: [], deleteLines: [] })
})

test("when the source changes, Naruvi's own translation is refreshed", () => {
  const plan = planTranslations(entry({
    display: { fr: { position: "Infirmière de nuit" }, en: { position: "Nurse" } },
    translations: { en: { position: { text: "Nurse", source: "Infirmière" } } },
    phrasings: [line("a", "fr", "Formation de 8 infirmières"), line("b", "en", "Trained 6 nurses", { autoText: "Trained 6 nurses", autoSource: "Formation de 6 infirmières" })],
  }), LANGS, "en")
  assert.deepEqual(plan.jobs[0].text, { position: "Infirmière de nuit" })
  assert.deepEqual(plan.jobs[0].lines.map((item) => item.replaces), ["b"])
})

test("text the user edited is theirs: never overwritten, and it becomes a source too", () => {
  const plan = planTranslations(entry({
    display: { fr: { position: "Infirmière de nuit" }, en: { position: "Night-shift nurse" } },
    translations: { en: { position: { text: "Nurse", source: "Infirmière" } } },
    phrasings: [line("a", "fr", "Formation de 8 infirmières"), line("b", "en", "Mentored 6 new nurses", { autoText: "Trained 6 nurses", autoSource: "Formation de 6 infirmières" })],
  }), LANGS, "en")
  assert.deepEqual(plan.jobs, [])
})

test("the user's edit in the target language becomes the source for a missing field", () => {
  const plan = planTranslations(entry({ display: { fr: { position: "Infirmière" }, en: { location: "Lyon, France" } } }), LANGS, "en")
  assert.deepEqual(plan.jobs.map((job) => [job.from, job.to, job.text]), [["fr", "en", { position: "Infirmière" }], ["en", "fr", { location: "Lyon, France" }]])
})

test("Naruvi's text whose source was removed goes away; the user's stays", () => {
  const plan = planTranslations(entry({
    display: { en: { position: "Nurse", location: "Lyon" } },
    translations: { en: { position: { text: "Nurse", source: "Infirmière" }, location: { text: "Lyon", source: "Lyon" } } },
    phrasings: [line("b", "en", "Trained 6 nurses", { autoText: "Trained 6 nurses", autoSource: "x" })],
  }), LANGS, "en")
  assert.deepEqual(plan.clearFields, [{ lang: "en", key: "position" }, { lang: "en", key: "location" }])
  assert.deepEqual(plan.deleteLines, ["b"])
})

test("only the kind's own translatable fields are considered", () => {
  const plan = planTranslations(entry({ kind: "certification", display: {} }), LANGS, "en")
  assert.deepEqual(plan.jobs, [])
  const project = planTranslations(entry({ kind: "project", display: { en: { tagline: "Budget app for students" } } }), LANGS, "en")
  assert.deepEqual(project.jobs[0].text, { tagline: "Budget app for students" })
})
