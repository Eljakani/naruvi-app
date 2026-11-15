import assert from "node:assert/strict"
import { test } from "node:test"
import { PRESETS, type DesignTokens } from "../../../lib/design"
import { fieldsOf, proposeDesigns, rankPresets, type CvShape } from "../../templates/design-director"

const shape: CvShape = { pages: 1, bullets: 14, entries: 4, skills: 12, hasSummary: true, showsPhoto: false, language: "en" }
const measure = async (t: DesignTokens) => ({ pages: t.size > 10.2 ? 2 : 1, lastPageFill: 0.9 })
const job = { title: "Senior Backend Engineer", company: "Northwind", description: "Build cloud services in Go. Kubernetes, CI/CD and data pipelines." }

test("a posting's field comes mostly from its title", () => {
  assert.equal(fieldsOf(job)[0], "tech")
  assert.equal(fieldsOf({ title: "Legal counsel", description: "Advise the engineering team on compliance." })[0], "formal")
  assert.deepEqual(fieldsOf({ title: "Nurse", description: "Care for patients." }), [])
})

test("ranking prefers the job's field and keeps side columns away from long CVs", () => {
  assert.ok(PRESETS[rankPresets(job, shape)[0].id].tags?.includes("tech"))
  const long = rankPresets(job, { ...shape, pages: 2, bullets: 30 }).slice(0, 5)
  assert.ok(long.every(({ id }) => PRESETS[id].tokens.layout === "single"))
})

test("without a model: three distinct, valid proposals, one of them ATS-safe", async () => {
  const proposals = await proposeDesigns({ job, shape, current: PRESETS.atlas.tokens, writeIn: "English" }, { measure })
  assert.equal(proposals.length, 3)
  assert.equal(new Set(proposals.map((item) => item.base)).size, 3)
  assert.ok(proposals.some((item) => item.insights.ats === "high"))
  assert.ok(proposals.every((item) => item.pages === 1))
})

test("the model picks and explains; unknown designs, forbidden keys and unreadable colours never get through", async () => {
  const complete = async () => ({ model: "m", text: JSON.stringify({ directions: [
    { base: "chrono", name: "Clear timeline", why: "Shows a steady engineering path.", changes: { accent: "#0f766e", size: 14, margin: 5 } },
    { base: "nope", name: "Ghost", why: "x", changes: {} },
    { base: "vertex", name: "Too pale", why: "Skills first.", changes: { accent: "#fde68a" } },
  ] }) })
  const proposals = await proposeDesigns({ job, shape, current: PRESETS.atlas.tokens, writeIn: "English" }, { complete: complete as never, measure })
  const chrono = proposals.find((item) => item.base === "chrono")!
  assert.equal(chrono.why, "Shows a steady engineering path.")
  assert.equal(chrono.tokens.accent, "#0f766e")
  assert.equal(chrono.tokens.size, PRESETS.chrono.tokens.size)
  assert.ok(!proposals.some((item) => item.base === "nope"))
  // The pale accent failed the contrast rule, so Vertex comes through as built.
  assert.equal(proposals.find((item) => item.base === "vertex")!.tokens.accent, PRESETS.vertex.tokens.accent)
  assert.equal(proposals.length, 3)
})

test("a design that only fits by going past the readable range is not proposed", async () => {
  const never = async () => ({ pages: 2, lastPageFill: 0.5 })
  assert.deepEqual(await proposeDesigns({ job, shape, current: PRESETS.atlas.tokens, writeIn: "English" }, { measure: never }), [])
})
