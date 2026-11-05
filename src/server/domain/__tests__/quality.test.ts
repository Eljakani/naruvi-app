import assert from "node:assert/strict"
import test from "node:test"
import type { CvDocument } from "../../documents/model"
import { checkQuality } from "../../documents/quality"

const doc = (overrides: Partial<CvDocument> = {}): CvDocument => ({
  version: 1,
  language: "en",
  template: "classic",
  accent: "#2563eb",
  header: { name: "Alex", headline: "Nurse", summary: "", email: "a@x.io", phone: "", location: "", links: [], photoPath: null, showPhoto: false },
  sections: [
    {
      id: "experience",
      kind: "experience",
      title: "Experience",
      included: true,
      groups: [],
      items: [{ entryId: "e", title: "Nurse", organization: "Hospital", dates: "", location: "", logoPath: null, included: true, bullets: [{ id: "b", text: "Cared for 30 patients.", source: "phrasing", phrasingId: "p", factIds: ["f1"], included: true }] }],
    },
  ],
  missingTranslations: [],
  ...overrides,
})

const status = (report: ReturnType<typeof checkQuality>, id: string) => report.checks.find((c) => c.id === id)?.status

test("a grounded, one-page CV with contact is ready", () => {
  const report = checkQuality(doc(), 1, [{ kind: "must", status: "met", text: "Patient care", factIds: ["f1"] }])
  assert.equal(report.ready, true)
  assert.equal(report.errors, 0)
  assert.equal(status(report, "coverage"), "pass")
})

test("ungrounded bullets, overflow and missing contact are errors", () => {
  const bad = doc({ header: { ...doc().header, email: "" } })
  bad.sections[0].items[0].bullets.push({ id: "x", text: "Made it up.", source: "phrasing", phrasingId: null, factIds: [], included: true })
  const report = checkQuality(bad, 3)
  assert.deepEqual([status(report, "grounded"), status(report, "contact"), status(report, "pages")], ["fail", "fail", "fail"])
  assert.equal(report.ready, false)
})

test("excluded bullets don't count; missing translations warn", () => {
  const d = doc({ missingTranslations: [{ entryId: "s", title: "School" }] })
  d.sections[0].items[0].bullets.push({ id: "x", text: "Excluded and ungrounded.", source: "phrasing", phrasingId: null, factIds: [], included: false })
  const report = checkQuality(d, 1)
  assert.equal(status(report, "grounded"), "pass")
  assert.equal(status(report, "translations"), "warn")
})

test("must-have evidence left out is flagged", () => {
  const report = checkQuality(doc(), 1, [
    { kind: "must", status: "met", text: "Patient care", factIds: ["f1"] },
    { kind: "must", status: "partial", text: "Epic EHR", factIds: ["f9"] },
  ])
  assert.equal(status(report, "coverage"), "warn")
  assert.match(report.checks.find((c) => c.id === "coverage")!.detail, /Epic EHR/)
})
