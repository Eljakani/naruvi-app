import assert from "node:assert/strict"
import { test } from "node:test"
import { PRESETS } from "../../../lib/design"
import { applyChanges, contrastOnWhite, qualityFailures, runDesignAgent } from "../../templates/design-agent"

const base = PRESETS.classic.tokens
const reply = (value: unknown) => ({ text: JSON.stringify(value), model: "fake", inputTokens: 1, outputTokens: 1 })

test("applyChanges keeps unknown keys and invalid values out", () => {
  const { tokens, changed } = applyChanges(base, { size: 9, accent: "navy", layout: "sidebar", nope: 1 })
  assert.equal(tokens.size, 9)
  assert.equal(tokens.accent, base.accent)
  assert.deepEqual(changed.sort(), ["layout", "size"])
})

test("quality rules catch unreadable designs", () => {
  assert.ok(contrastOnWhite("#ffff99") < 3)
  const failures = qualityFailures({ ...base, size: 7.9, accent: "#ffff99", accentHeadings: true }, { pages: 2, lastPageFill: 0.1 })
  assert.equal(failures.length, 3)
})

test("the loop feeds back real measurements until the goal passes", async () => {
  const prompts: string[] = []
  const rounds = [
    { changes: { size: 9.4 }, goals: [{ type: "maxPages", value: 1 }], summary: "Smaller text" },
    { changes: { spacing: 0.75, margin: 26 }, goals: [], summary: "Tighter spacing" },
  ]
  const result = await runDesignAgent({ tokens: base, request: "fit on one page" }, {
    complete: async (input) => { prompts.push(input.user); return reply(rounds[prompts.length - 1]) },
    measure: async (tokens) => ({ pages: tokens.spacing < 0.8 ? 1 : 2, lastPageFill: 0.5 }),
  })
  assert.equal(result.attempts.length, 2)
  assert.equal(result.satisfied, true)
  assert.equal(result.tokens.size, 9.4, "earlier rounds' changes are kept")
  assert.match(prompts[1], /at most 1 page\(s\), got 2/)
})

test("the best attempt wins and a failed final check is reported", async () => {
  const result = await runDesignAgent({ tokens: base, request: "make it dark green" }, {
    complete: async () => reply({ changes: { accent: "#14532d" }, goals: [{ type: "token", key: "accent", op: "changed" }], summary: "Dark green" }),
    measure: async () => ({ pages: 1, lastPageFill: 0.8 }),
    judge: async () => ({ satisfied: false, reason: "Headings are not green yet" }),
  })
  assert.equal(result.tokens.accent, "#14532d")
  assert.equal(result.satisfied, false)
  assert.equal(result.verdict, "Headings are not green yet")
})
