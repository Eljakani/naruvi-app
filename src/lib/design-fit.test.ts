import assert from "node:assert/strict"
import { test } from "node:test"
import { PRESETS } from "./design"
import { FIT_CEILING, FIT_FLOOR, fitDesign, scaleDesign } from "./design-fit"
import { designInsights } from "./design-insights"

const atlas = PRESETS.atlas.tokens
/** A page model: height grows with text size, line height and gaps; one page holds 100 units. */
const model = (lines: number) => async (t: typeof atlas) => {
  const used = (lines * t.size * t.lineHeight * (0.7 + 0.3 * t.spacing)) / 10 + (60 - (842 - 2 * t.margin) / 14)
  const pages = Math.max(1, Math.ceil(used / 100))
  return { pages, lastPageFill: (used - (pages - 1) * 100) / 100 }
}

test("scaleDesign stays inside the readable range and never undoes a tighter choice", () => {
  const tight = scaleDesign(atlas, 1)
  assert.equal(tight.size, FIT_FLOOR.size)
  assert.equal(tight.margin, FIT_FLOOR.margin)
  assert.ok(tight.nameSize >= tight.size + 5)
  assert.equal(scaleDesign(atlas, -1).size, FIT_CEILING.size)
  assert.equal(scaleDesign({ ...atlas, size: 8.5 }, 1).size, 8.5)
  assert.deepEqual(scaleDesign(atlas, 0), atlas)
})

test("fitDesign tightens only as much as needed", async () => {
  const measure = model(84)
  assert.equal((await measure(atlas)).pages, 2)
  const result = await fitDesign(atlas, 1, measure)
  assert.equal(result.fits, true)
  assert.equal(result.direction, "tightened")
  assert.ok(result.tokens.size > FIT_FLOOR.size, "did not go straight to the smallest text")
  assert.ok(result.lastPageFill > 0.9, "the page is used")
})

test("fitDesign reports when layout alone cannot reach the target", async () => {
  const result = await fitDesign(atlas, 1, model(200))
  assert.equal(result.fits, false)
  assert.equal(result.tokens.size, FIT_FLOOR.size)
})

test("fitDesign fills a half-empty page without adding one", async () => {
  const measure = model(50)
  const before = await measure(atlas)
  const result = await fitDesign(atlas, 1, measure)
  assert.equal(result.direction, "loosened")
  assert.equal(result.pages, 1)
  assert.ok(result.lastPageFill > before.lastPageFill)
})

test("design insights: one column reads best, side columns and rails cost a level", () => {
  assert.equal(designInsights(PRESETS.quartz.tokens).ats, "high")
  assert.equal(designInsights(PRESETS.vertex.tokens).ats, "good")
  assert.deepEqual(designInsights(PRESETS.chrono.tokens).reasons, ["timeline", "labels"])
  assert.equal(designInsights(PRESETS.slate.tokens).density, "compact")
  assert.equal(designInsights(PRESETS.nordic.tokens).density, "airy")
})
