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
  assert.equal(result.outcome, "applied")
  assert.equal(result.tokens.size, 9.4, "earlier rounds' changes are kept")
  assert.match(prompts[1], /at most 1 page\(s\), got 2/)
})

test("a failed final check applies nothing and says why", async () => {
  const result = await runDesignAgent({ tokens: base, request: "make it dark green" }, {
    complete: async () => reply({ changes: { accent: "#14532d" }, goals: [{ type: "token", key: "accent", op: "changed" }], summary: "Dark green" }),
    measure: async () => ({ pages: 1, lastPageFill: 0.8 }),
    judge: async () => ({ satisfied: false, reason: "Headings are not green yet" }),
  })
  assert.equal(result.outcome, "rejected")
  assert.equal(result.tokens.accent, base.accent, "nothing applied")
  assert.equal(result.reason, "Headings are not green yet")
})

test("unreadable results are never applied halfway", async () => {
  const result = await runDesignAgent({ tokens: base, request: "dark theme" }, {
    complete: async () => reply({ changes: { ink: "#f5f5f4", accent: "#86efac", accentHeadings: true }, goals: [], summary: "Dark theme" }),
    measure: async () => ({ pages: 1, lastPageFill: 0.8 }),
    maxRounds: 2,
  })
  assert.equal(result.outcome, "rejected")
  assert.deepEqual(result.tokens, base)
  assert.match(result.reason, /print on white/)
})

test("requests the tokens can't express are declined up front", async () => {
  const result = await runDesignAgent({ tokens: base, request: "add a background photo" }, {
    complete: async () => reply({ changes: {}, goals: [], summary: "", unsupported: "CVs are printed on white, so a background photo isn’t possible." }),
    measure: async () => { throw new Error("should not render") },
  })
  assert.equal(result.outcome, "rejected")
  assert.match(result.reason, /printed on white/)
})
