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
