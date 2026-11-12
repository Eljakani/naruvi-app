import assert from "node:assert/strict"
import { test } from "node:test"
import { describeEntry, importProfileText, translateEntry, translateFacts } from "../../profile/ai-import"

const reply = (value: unknown) => async () => ({ text: JSON.stringify(value), model: "fake", inputTokens: 1, outputTokens: 1 })
const cv = "Night nurse at City Hospital (2021 – 2024). Trained 6 new nurses on a 40-bed ward. Skills: triage, DxCare. Volunteer work on weekends to fill this line out."

test("import: drops facts with numbers not in the CV and skills not mentioned", async () => {
  const result = await importProfileText(cv, reply({
    language: "en",
    identity: { fullName: "A B" },
    entries: [{ kind: "experience", text: { position: "Night nurse", role: "dropped: not an experience field" }, fields: { company: "City Hospital", dates: "2021 – 2024", employment: "made-up" },
      facts: ["Trained 6 new nurses", "Ran a 60-bed ward", "Worked night shifts"], skills: ["triage", "Kubernetes"],
      bullets: [{ text: "Trained 6 new nurses on a 40-bed ward", facts: [0] }, { text: "Ran a 60-bed ward", facts: [1] }] }],
  }))
  const entry = result.entries[0]
  assert.deepEqual(entry.facts, ["Trained 6 new nurses", "Worked night shifts"])
  assert.deepEqual(entry.skills, ["triage"])
  assert.equal(entry.bullets.length, 1)
  assert.equal(entry.dropped, 2)
  // Only the kind's own fields survive, in valid shapes; CV-style dates are read.
  assert.deepEqual(entry.text, { position: "Night nurse" })
  assert.deepEqual(entry.fields, { company: "City Hospital", dates: { start: "2021", end: "2024" } })
})

test("describe: skips facts already in the entry", async () => {
  const result = await describeEntry("I trained 6 new nurses and worked nights at City Hospital for three years.", { existingFacts: ["Trained 6 new nurses"] }, reply({
    language: "en", entry: { kind: "experience", text: {}, fields: { company: "City Hospital" }, facts: ["Trained 6 new nurses", "Worked night shifts"], skills: [] },
  }))
  assert.deepEqual(result.entry.facts, ["Worked night shifts"])
})

test("translate: a bullet whose numbers change is rejected", async () => {
  const result = await translateEntry({ from: "fr", to: "en", text: { position: "Infirmière" }, bullets: [{ id: "a", text: "Formation de 6 infirmières" }, { id: "b", text: "Service de 40 lits" }] }, reply({
    text: { position: "Nurse", extra: "ignored" }, bullets: [{ id: "a", text: "Trained 6 nurses" }, { id: "b", text: "A 400-bed unit" }],
  }))
  assert.deepEqual(result.bullets, [{ id: "a", text: "Trained 6 nurses" }])
  assert.deepEqual(result.text, { position: "Nurse" })
})

test("import: names put in the wrong slot are kept, lists are capped, language is normalized", async () => {
  const text = "Formation : Master Informatique, Université de Lyon (2019 - 2021). Projet Pocket Planner. Certification AWS Solutions Architect. Compétences : " + Array.from({ length: 50 }, (_, i) => `Outil${i}`).join(", ") + ". Node.js, ReactJS."
  const result = await importProfileText(text, reply({
    language: "FR",
    identity: {},
    entries: [
      // school and project/certification names given as per-language text, degree under a model-made key
      { kind: "education", text: { school: "Université de Lyon", diploma: "Master Informatique" }, fields: { period: "2019 - 2021" }, facts: [], skills: [] },
      { kind: "project", text: { name: "Pocket Planner" }, fields: {}, facts: ["Built Pocket Planner"], skills: [] },
      { kind: "certification", text: { title: "AWS Solutions Architect" }, fields: {}, facts: [], skills: ["AWS"] },
      { kind: "skill", text: {}, fields: {}, facts: [], skills: [...Array.from({ length: 50 }, (_, i) => `Outil${i}`), "node js", "React JS"] },
    ],
  }))
  assert.equal(result.language, "fr")
  const [education, project, certification, skills] = result.entries
  assert.deepEqual(education.text, { degree: "Master Informatique" })
  assert.deepEqual(education.fields, { school: "Université de Lyon", dates: { start: "2019", end: "2021" } })
  assert.equal(education.unnamed, undefined)
  assert.equal(project.fields.name, "Pocket Planner")
  assert.equal(certification.fields.name, "AWS Solutions Architect")
  // 52 skills, none rejected for the count; "node js" / "React JS" meet "Node.js" / "ReactJS".
  assert.equal(skills.skills.length, 52)
  assert.equal(skills.text.name, "Compétences")
})

test("import: an entry whose name can't be read is flagged, not dropped", async () => {
  const result = await importProfileText(cv, reply({ language: "en", identity: {}, entries: [{ kind: "experience", text: {}, fields: { company: "City Hospital" }, facts: ["Worked night shifts"], skills: [] }] }))
  assert.equal(result.entries.length, 1)
  assert.equal(result.entries[0].unnamed, true)
})

test("translate facts: keeps translations with the same numbers, per requested language", async () => {
  const result = await translateFacts({ languages: ["en", "fr"], facts: [{ id: "a", text: "Formation de 6 infirmières" }, { id: "b", text: "Service de 40 lits" }] }, reply({
    facts: [{ id: "a", translations: { en: "Trained 6 nurses", fr: "Formation de 6 infirmières", de: "ignored" } }, { id: "b", translations: { en: "A 400-bed unit" } }, { id: "zzz", translations: { en: "unknown" } }],
  }))
  assert.deepEqual(result.facts, [{ id: "a", translations: { en: "Trained 6 nurses", fr: "Formation de 6 infirmières" } }])
})
