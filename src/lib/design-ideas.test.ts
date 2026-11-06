import assert from "node:assert/strict"
import { test } from "node:test"
import { ALL_PRESETS as PRESETS } from "./design"
import { designIdeas } from "./design-ideas"

test("suggestions fit the current design", () => {
  const sidebar = designIdeas(PRESETS.sidebar.tokens, { pages: 2 })
  assert.ok(sidebar.includes("Make it fit on one page"), "two pages → fit")
  assert.ok(!sidebar.includes("Two columns with skills on the side"), "already two columns")
  const executive = designIdeas(PRESETS.executive.tokens, { pages: 1 })
  assert.ok(!executive.includes("Make it fit on one page"))
  assert.ok(!executive.includes("Bigger name, centred header"), "already centred")
})

test("suggestions rotate between requests and skip the last one", () => {
  const first = designIdeas(PRESETS.classic.tokens, { seed: 0 })
  const later = designIdeas(PRESETS.classic.tokens, { seed: 3, exclude: [first[0]] })
  assert.equal(first.length, 5)
  assert.ok(!later.includes(first[0]))
  assert.notDeepEqual(first, later)
})

test("letter-only and CV-only changes affect one document", async () => {
  const { affectedDocuments } = await import("./design")
  assert.deepEqual(affectedDocuments(["letterSubject"]), { cv: false, letter: true })
  assert.deepEqual(affectedDocuments(["skillsStyle", "layout"]), { cv: true, letter: false })
  assert.deepEqual(affectedDocuments(["accent"]), { cv: true, letter: true })
})
