import assert from "node:assert/strict"
import { test } from "node:test"
import { groundedFields } from "../../jobs/ai-extract"
import { checkAngles } from "../../research/ai-angles"
import { suggestBullets } from "../../profile/ai-bullets"

const posting = "Acme Robotics is hiring a Senior Data Engineer in Lyon, France. Hybrid, CDI. Salary 55k–65k €. You will build pipelines."

test("job fields: only values present in the posting survive", () => {
  const fields = groundedFields({ role: "Senior Data Engineer", company: "Acme Robotics", location: "Paris", remote: "hybrid", employmentType: "CDI", salary: "55k–65k €", language: "en" }, posting)
  assert.equal(fields.role, "Senior Data Engineer")
  assert.equal(fields.company, "Acme Robotics")
  assert.equal(fields.location, undefined, "invented location dropped")
  assert.equal(fields.remote, "hybrid")
  assert.equal(fields.salary, "55k–65k €")
})

test("job fields: remote claim needs evidence", () => {
  const fields = groundedFields({ role: "", company: "", location: "", remote: "remote", employmentType: "", salary: "", language: "en" }, posting)
  assert.equal(fields.remote, undefined)
})

test("company angles: uncited or invented numbers are rejected", () => {
  const sources = new Map([["S1", { text: "We power 300 farms across Europe.", url: "https://acme.test/about" }]])
  const kept = checkAngles(
    [
      { text: "Acme powers 300 farms across Europe.", sources: ["S1"] },
      { text: "Acme serves 5,000 farms.", sources: ["S1"] },
      { text: "Acme is expanding to Asia.", sources: ["S9"] },
    ],
    sources,
  )
  assert.deepEqual(kept, [{ text: "Acme powers 300 farms across Europe.", sources: ["https://acme.test/about"] }])
})

test("bullet suggestions: cite real facts and add no numbers", async () => {
  const complete = async () => ({
    model: "fake", inputTokens: 1, outputTokens: 1,
    text: JSON.stringify({ bullets: [
      { language: "en", text: "Reduced ticket backlog by 40% through triage", facts: ["F1"] },
      { language: "en", text: "Reduced ticket backlog by 60%", facts: ["F1"] },
      { language: "en", text: "Trained new hires", facts: ["F7"] },
      { language: "de", text: "Rückstand um 40% reduziert", facts: ["F1"] },
    ] }),
  })
  const result = await suggestBullets({ kind: "experience", role: "Support lead", organization: "Acme", facts: [{ key: "k1", statement: "Cut the ticket backlog by 40% by introducing triage." }], existing: [], languages: ["en", "fr"] }, complete)
  assert.deepEqual(result.bullets, [{ language: "en", text: "Reduced ticket backlog by 40% through triage", factKeys: ["k1"] }])
})
