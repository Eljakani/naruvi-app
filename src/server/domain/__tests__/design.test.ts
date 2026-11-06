import assert from "node:assert/strict"
import { test } from "node:test"
import { designTokens, ALL_PRESETS as PRESETS } from "../../../lib/design"
import { cvDocument, resolveDesign } from "../../documents/model"

test("every preset is a valid, complete design", () => {
  for (const [id, preset] of Object.entries(PRESETS)) assert.deepEqual(designTokens.parse(preset.tokens), preset.tokens, id)
})

test("resolveDesign: preset + accent for old documents, saved tokens win when present", () => {
  assert.equal(resolveDesign({ template: "modern", accent: "#be123c" }).font, "inter")
  assert.equal(resolveDesign({ template: "modern", accent: "#be123c" }).accent, "#be123c")
  const custom = { ...PRESETS.serif.tokens, accent: "#0f766e" }
  assert.equal(resolveDesign({ template: "custom", design: custom, accent: "#2563eb" }).accent, "#0f766e")
  assert.equal(resolveDesign({ template: "unknown-old-id" }).font, PRESETS.classic.tokens.font)
})

test("documents with an unknown template id still parse", () => {
  const doc = cvDocument.parse({ version: 1, language: "en", template: "retro", header: { name: "A" }, sections: [] })
  assert.equal(doc.template, "classic")
})
