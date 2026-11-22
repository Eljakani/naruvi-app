import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeEntryDraft } from "./entry-fields"

test("an 'other' entry given a name puts it in its title", () => {
  const draft = normalizeEntryDraft("other", "en", { name: "Acme Labs", subtitle: "Member of a startup programme" }, { dates: "2026-03 – present" })
  assert.deepEqual(draft.unknown, [])
  assert.deepEqual(draft.display, { en: { title: "Acme Labs", subtitle: "Member of a startup programme" } })
  assert.equal(draft.fields.dates, "2026-03 – present")
})

test("text keyed by language fills both languages, even as JSON text", () => {
  const draft = normalizeEntryDraft("other", "en", { en: '{"title": "Acme Labs", "subtitle": "Startup programme"}', fr: { title: "Acme Labs", subtitle: "Programme startup" } }, { url: "https://example.com" })
  assert.deepEqual(draft.unknown, [])
  assert.deepEqual(draft.display, { en: { title: "Acme Labs", subtitle: "Startup programme" }, fr: { title: "Acme Labs", subtitle: "Programme startup" } })
  assert.equal(draft.fields.url, "https://example.com")
})

test("empty language keys are ignored, not reported as fields", () => {
  const draft = normalizeEntryDraft("other", "en", { en: "", fr: "" }, { title: "Acme Labs" })
  assert.deepEqual(draft.unknown, [])
  assert.deepEqual(draft.display, { en: { title: "Acme Labs" } })
})

test("fields in the wrong bucket and common synonyms land in the right place", () => {
  const draft = normalizeEntryDraft("experience", "fr", { company: "Northwind" }, { role: "Chef de projet", startDate: "2023-01", endDate: "present" })
  assert.deepEqual(draft.unknown, [])
  assert.deepEqual(draft.display, { fr: { position: "Chef de projet" } })
  assert.deepEqual(draft.fields, { company: "Northwind", dates: { start: "2023-01", end: "present" } })
})

test("an exact field wins over a synonym, and real unknowns are reported", () => {
  const draft = normalizeEntryDraft("project", "en", { tagline: "A tool", description: "Other words" }, { stars: "12" })
  assert.equal(draft.display.en.tagline, "A tool")
  assert.deepEqual(draft.unknown, ["stars"])
})
