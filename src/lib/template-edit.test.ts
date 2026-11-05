import assert from "node:assert/strict"
import test from "node:test"
import { PRESETS } from "./design"
import { fitDesignToPage, mergeDesignChanges } from "./template-edit"

test("an AI reply keeps both unrelated manual edits and manual edits to the same field", () => {
  const before = PRESETS.modern.tokens
  const current = { ...before, size: 10.2, accent: "#4338ca" }
  const merged = mergeDesignChanges(before, current, { accent: "#14532d", accentHeadings: false })
  assert.equal(merged.size, 10.2)
  assert.equal(merged.accent, "#4338ca")
  assert.equal(merged.accentHeadings, false)
})

test("page fitting stops at the first render that fits", async () => {
  const before = PRESETS.serif.tokens
  const attempts: number[] = []
  const result = await fitDesignToPage(before, async (tokens) => {
    attempts.push(tokens.size)
    return tokens.size <= 9 ? 1 : 2
  })
  assert.deepEqual(attempts, [10, 9.4, 9])
  assert.equal(result.fitted, true)
  assert.equal(result.pages, 1)
  assert.equal(result.tokens.font, before.font)
})

test("an impossible fit reports the measured page count without dropping below the readability floor", async () => {
  const before = PRESETS.serif.tokens
  const attempts: number[] = []
  const result = await fitDesignToPage(before, async (tokens) => {
    attempts.push(tokens.size)
    return 2
  })
  assert.deepEqual(attempts, [10, 9.4, 9, 8.6])
  assert.equal(result.fitted, false)
  assert.equal(result.pages, 2)
  assert.deepEqual(result.tokens, before)
})
