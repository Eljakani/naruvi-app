import assert from "node:assert/strict"
import { test } from "node:test"
import { matchEntry, sameFact, type ExistingEntry } from "../../profile/import-match"

const existing: ExistingEntry[] = [
  { id: "e1", kind: "experience", status: "verified", display: { en: { position: "Cloud Engineer" } }, fields: { company: "Northwind" }, facts: ["Wrote Go cleanup scripts for the cloud."], skills: ["Go", "AWS"] },
  { id: "e2", kind: "education", status: "verified", display: { fr: { degree: "Diplôme d'ingénieur" } }, fields: { school: "Riverside University" }, facts: [], skills: [] },
]

test("match: same company and role, only new facts and skills kept", () => {
  const match = matchEntry({ kind: "experience", text: { position: "Cloud engineer intern" }, fields: { company: "Northwind Traders", dates: { start: "2023" } }, facts: ["Wrote Go cleanup scripts for the cloud", "Saved $3,600 per month"], skills: ["go", "Kubernetes"] }, existing)
  assert.equal(match?.entryId, "e1")
  assert.deepEqual(match?.newFacts, ["Saved $3,600 per month"])
  assert.deepEqual(match?.newSkills, ["Kubernetes"])
  assert.equal(match?.knownFacts, 1)
})

test("match: different kind family or company is a new entry", () => {
  assert.equal(matchEntry({ kind: "experience", text: { position: "SRE" }, fields: { company: "Google" }, facts: [], skills: [] }, existing), null)
  assert.equal(matchEntry({ kind: "education", text: { degree: "Cloud Architect" }, fields: { school: "Northwind" }, facts: [], skills: [] }, existing), null)
  assert.equal(matchEntry({ kind: "education", text: { degree: "Engineering degree" }, fields: { school: "Riverside University", dates: { start: "2024" } }, facts: [], skills: [] }, existing)?.entryId, "e2")
})

test("sameFact tolerates punctuation and small rewording only", () => {
  assert.equal(sameFact("Trained 6 new nurses.", "trained 6 new nurses"), true)
  assert.equal(sameFact("Trained 6 new nurses", "Hired 6 new nurses for the ward"), false)
})
