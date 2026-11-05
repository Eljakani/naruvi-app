import assert from "node:assert/strict"
import { test } from "node:test"
import { matchEntry, sameFact, type ExistingEntry } from "../../profile/import-match"

const existing: ExistingEntry[] = [
  { id: "e1", kind: "experience", title: "Oracle R&D", status: "verified", display: { en: { role: "Cloud Engineer", organization: "Oracle" } }, facts: ["Wrote Go cleanup scripts for OCI."], skills: ["Go", "OCI"] },
  { id: "e2", kind: "education", title: "ENSA Marrakech — Engineering degree", status: "verified", display: { fr: { role: "Diplôme d'ingénieur", organization: "ENSA Marrakech" } }, facts: [], skills: [] },
]

test("match: same company and role, only new facts and skills kept", () => {
  const match = matchEntry({ kind: "experience", title: "Oracle — Software engineer", display: { role: "Cloud engineer intern", organization: "Oracle Corporation", dates: "2023" }, facts: ["Wrote Go cleanup scripts for OCI", "Saved $3,600 per month"], skills: ["go", "Kubernetes"] }, existing)
  assert.equal(match?.entryId, "e1")
  assert.deepEqual(match?.newFacts, ["Saved $3,600 per month"])
  assert.deepEqual(match?.newSkills, ["Kubernetes"])
  assert.equal(match?.knownFacts, 1)
})

test("match: different kind family or company is a new entry", () => {
  assert.equal(matchEntry({ kind: "experience", title: "Google — SRE", display: { role: "SRE", organization: "Google", dates: "" }, facts: [], skills: [] }, existing), null)
  assert.equal(matchEntry({ kind: "education", title: "Oracle certification", display: { role: "OCI Architect", organization: "Oracle", dates: "" }, facts: [], skills: [] }, existing), null)
  assert.equal(matchEntry({ kind: "education", title: "ENSA Marrakech", display: { role: "Engineering degree", organization: "ENSA Marrakech", dates: "2024" }, facts: [], skills: [] }, existing)?.entryId, "e2")
})

test("sameFact tolerates punctuation and small rewording only", () => {
  assert.equal(sameFact("Trained 6 new nurses.", "trained 6 new nurses"), true)
  assert.equal(sameFact("Trained 6 new nurses", "Hired 6 new nurses for the ward"), false)
})
