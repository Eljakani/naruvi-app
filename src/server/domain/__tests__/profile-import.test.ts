import assert from "node:assert/strict"
import { test } from "node:test"
import { describeEntry, importProfileText, translateEntry } from "../../profile/ai-import"

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
