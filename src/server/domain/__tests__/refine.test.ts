import assert from "node:assert/strict"
import test from "node:test"
import type { RequirementMatch } from "../../analysis/match"
import { refineMatches } from "../../analysis/refine"

const m = (id: string, status: RequirementMatch["status"]): RequirementMatch => ({ id, text: `req ${id}`, kind: "must", section: "", keywords: [], years: null, status, factIds: [], covered: [], missing: [], note: "", source: "rules" })
const candidates = { r1: [{ id: "uuid-a", statement: "Did A", entry: "X", kind: "experience" }], r2: [{ id: "uuid-b", statement: "Did B", entry: "Y", kind: "experience" }] }

test("model output is mapped back to real fact ids and guarded", async () => {
  const fake = async () => ({
    text: JSON.stringify({
      reviews: [
        { id: "r1", status: "met", facts: ["F1"], note: "Shown by F1" },
        { id: "r2", status: "met", facts: ["F9"], note: "invented id" },
        { id: "r3", status: "met", facts: ["F1"], note: "not a target" },
      ],
    }),
  })
  const result = await refineMatches([m("r1", "partial"), m("r2", "judgement"), m("r3", "gap")], candidates, fake)
  assert.deepEqual(result.matches.map((x) => [x.id, x.status, x.factIds.join()]), [
    ["r1", "met", "uuid-a"],
    ["r2", "partial", ""], // invented id dropped → cannot be met
    ["r3", "gap", ""], // rules-decided gap untouched
  ])
  assert.equal(result.matches[0].source, "model")
})

test("malformed model output changes nothing", async () => {
  const before = [m("r1", "partial")]
  const result = await refineMatches(before, candidates, async () => ({ text: "Sure! Here is my analysis…" }))
  assert.equal(result.changed, 0)
  assert.deepEqual(result.matches, before)
})

test("full review: finds semantic matches for rule gaps, with guards", async () => {
  const { reviewAllMatches } = await import("../../analysis/refine")
  const base = { kind: "must" as const, section: "", keywords: [], years: null, covered: [], missing: [], note: "", source: "rules" as const }
  const matches = [
    { ...base, id: "r1", text: "Observability", status: "gap" as const, factIds: [] },
    { ...base, id: "r2", text: "Kubernetes", status: "met" as const, factIds: ["f9"] },
    { ...base, id: "r3", text: "Rust", status: "gap" as const, factIds: [] },
    { ...base, id: "r4", text: "Go", status: "gap" as const, factIds: [] },
  ]
  const catalog = [{ id: "f1", statement: "Built Prometheus monitoring", entry: "Oracle", kind: "experience" }]
  const fake = async () => ({ text: JSON.stringify({ reviews: [
    { id: "r1", status: "met", facts: ["F1"], note: "Prometheus monitoring" },
    { id: "r2", status: "gap", facts: [], note: "" },
    { id: "r3", status: "met", facts: ["F99"], note: "invented" },
    { id: "r4", status: "partial", facts: [], note: "" },
  ] }) })
  const result = await reviewAllMatches(matches, catalog, fake)
  const by = Object.fromEntries(result.matches.map((m) => [m.id, m]))
  assert.equal(by.r1.status, "met")
  assert.deepEqual(by.r1.factIds, ["f1"])
  assert.equal(by.r2.status, "partial", "rule met can only drop to partial")
  assert.equal(by.r3.status, "gap", "invented fact id is not evidence")
  assert.equal(by.r4.status, "gap", "partial needs a cited fact")
})
