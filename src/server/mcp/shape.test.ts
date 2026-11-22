import test from "node:test"
import assert from "node:assert/strict"
import type { Analysis, RequirementMatch } from "@/server/analysis/match"
import type { CvDocument } from "@/server/documents/model"
import type { LetterDocument } from "@/server/documents/letter"
import { cvText, entrySummary, fitDetail, letterText, profileSummary, styleSummary, type FactRef } from "./shape"

const requirement = (overrides: Partial<RequirementMatch>): RequirementMatch => ({
  id: "r1", text: "Experience with Terraform", kind: "must", section: "Requirements", keywords: ["terraform"], years: null,
  status: "met", factIds: [], covered: ["terraform"], missing: [], note: "", source: "rules", ...overrides,
})

const facts: FactRef[] = [
  { id: "f1", statement: "Wrote Terraform modules for three staging environments.", entryId: "e1", entryTitle: "Platform Engineer — Northwind Labs", entryKind: "experience" },
  { id: "f2", statement: "Led a course project on container scanning.", entryId: "e2", entryTitle: "MSc Computer Science — Example University", entryKind: "education" },
]

const analysis: Analysis & { analyzedAt: string; factCount: number } = {
  version: 1,
  fitScore: 72,
  counts: { met: 1, partial: 1, gap: 1, judgement: 1 },
  requirements: [
    requirement({ factIds: ["f1"] }),
    requirement({ id: "r2", text: "Kubernetes security", status: "partial", factIds: ["f2", "gone"], covered: ["security"], missing: ["kubernetes"], note: "Related facts, but they don't fully cover this." }),
    requirement({ id: "r3", text: "Go programming", status: "gap", covered: [], missing: ["go"], note: "Nothing in your verified facts backs this. Don't claim it." }),
    requirement({ id: "r4", text: "Curious and collaborative", kind: "nice", status: "judgement", covered: [] }),
  ],
  keywords: [{ key: "terraform", count: 3, inProfile: true }, { key: "go", count: 2, inProfile: false }],
  recommendedEntries: [{ entryId: "e1", title: "Platform Engineer — Northwind Labs", kind: "experience", requirements: 2 }],
  mustGaps: ["Go programming"],
  analyzedAt: "2026-11-01T10:00:00.000Z",
  factCount: 12,
}

test("fit detail names each requirement's strength and the facts behind it", () => {
  const detail = fitDetail(analysis, facts)
  assert.equal(detail.fit, 72)
  assert.deepEqual(detail.counts, { proven: 1, partial: 1, missing: 1, yourCall: 1 })
  assert.equal(detail.requirements.length, 4)
  const [met, partial, gap] = detail.requirements
  assert.equal(met.strength, "proven by verified facts")
  assert.deepEqual(met.evidence, [{ factId: "f1", statement: facts[0].statement, entry: { id: "e1", title: "Platform Engineer — Northwind Labs", kind: "experience" } }])
  assert.deepEqual(partial.missing, ["kubernetes"])
  assert.equal(partial.evidence[0].entry.kind, "education")
  assert.equal(partial.staleEvidence, 1, "a cited fact that is no longer verified is counted, not shown")
  assert.equal(gap.evidence.length, 0)
  assert.deepEqual(detail.mustHaveGaps, ["Go programming"])
  assert.equal(detail.recommendedEntries[0].requirementsBacked, 2)
})

test("fit detail filters by status and hides a score nothing could be scored for", () => {
  assert.deepEqual(fitDetail(analysis, facts, "gap").requirements.map((item) => item.id), ["r3"])
  const empty = fitDetail({ ...analysis, fitScore: 0, counts: { met: 0, partial: 0, gap: 0, judgement: 2 } }, facts)
  assert.equal(empty.fit, null)
})

const cv = {
  version: 1, language: "en", template: "atlas", accent: "#2563eb",
  header: { name: "Alex Example", headline: "Platform Engineer", summary: "Builds reliable delivery pipelines.", email: "alex@example.com", phone: "", location: "Lyon", links: [{ label: "GitHub", url: "https://github.com/alex-example" }], photoPath: null, showPhoto: false },
  sections: [
    { id: "s1", kind: "experience", title: "Experience", included: true, groups: [], items: [
      { entryId: "e1", title: "Platform Engineer", organization: "Northwind Labs", dates: "2024 – present", location: "", logoPath: null, included: true, bullets: [
        { id: "b1", text: "Wrote Terraform modules for three environments.", source: "fact", phrasingId: null, factIds: ["f1"], included: true },
        { id: "b2", text: "Left out on purpose.", source: "fact", phrasingId: null, factIds: [], included: false },
      ] },
    ] },
    { id: "s2", kind: "skills", title: "Skills", included: true, items: [], groups: [{ label: "Cloud", values: ["Terraform", "AWS"] }] },
    { id: "s3", kind: "project", title: "Projects", included: false, items: [], groups: [] },
  ],
  missingTranslations: [],
} as unknown as CvDocument

test("CV text follows the printed document and skips what is left out", () => {
  const text = cvText(cv)
  assert.match(text, /^# Alex Example\n\*\*Platform Engineer\*\*/)
  assert.match(text, /alex@example\.com · Lyon · https:\/\/github\.com\/alex-example/)
  assert.match(text, /### Platform Engineer \(Northwind Labs · 2024 – present\)\n- Wrote Terraform modules/)
  assert.match(text, /- \*\*Cloud\*\*: Terraform, AWS/)
  assert.doesNotMatch(text, /Left out on purpose|Projects/)
})

test("letter text puts highlights under their paragraph and drops excluded ones", () => {
  const letter = {
    header: { name: "Alex Example" }, date: "1 December 2026", recipient: { company: "Contoso" }, subject: "Application: Platform Engineer", salutation: "Dear hiring team,",
    paragraphs: [
      { id: "p1", kind: "opening", text: "I am applying for the Platform Engineer role.", included: true, placeholder: false },
      { id: "p2", kind: "highlights", text: "A few things I bring:", included: true, placeholder: false },
      { id: "p3", kind: "custom", text: "Not this one.", included: false, placeholder: false },
    ],
    highlightsIntro: "",
    highlights: [{ id: "h1", text: "Terraform at scale", organization: "Northwind Labs", factIds: [], included: true }],
    signoff: "Kind regards,\nAlex Example",
  } as unknown as LetterDocument
  const text = letterText(letter)
  assert.match(text, /A few things I bring:\n\n- Terraform at scale \(Northwind Labs\)/)
  assert.doesNotMatch(text, /Not this one/)
  assert.match(text, /Kind regards,\nAlex Example$/)
})

const entry = {
  id: "e1", kind: "experience", status: "verified",
  display: { en: { position: "Platform Engineer", location: "Lyon" } },
  fields: { company: "Northwind Labs", dates: { start: "2024-03", end: "present" } },
  skills: ["Terraform"], tags: [], confidential: true, doNotClaim: ["Do not claim team lead"],
  facts: [{ id: "f1", statement: "Wrote Terraform modules for three staging environments." }],
}

test("profile entries read as title, organization and dates, with facts on request", () => {
  const full = entrySummary(entry, "en")
  assert.equal(full.title, "Platform Engineer")
  assert.equal(full.organization, "Northwind Labs")
  assert.ok(full.dates?.includes("2024"))
  assert.equal(full.confidential, true)
  assert.deepEqual(full.doNotClaim, ["Do not claim team lead"])
  assert.equal("facts" in full && full.facts?.length, 1)
  const short = entrySummary(entry, "en", { facts: false })
  assert.equal("factCount" in short && short.factCount, 1)
})

test("profile summary counts active entries by kind and status", () => {
  const summary = profileSummary(
    { fullName: "Alex Example", headlines: { en: "Platform Engineer" }, summaries: {}, email: "alex@example.com", phone: "", location: "Lyon", availability: "", links: [], defaultLanguage: "en", goals: [] },
    [{ kind: "experience", status: "verified" }, { kind: "education", status: "needs_review" }, { kind: "project", status: "archived" }],
  )
  assert.deepEqual(summary.entries, { total: 2, verified: 1, needsReview: 1, byKind: { experience: 1, education: 1 } })
  assert.equal(summary.phone, null)
})

test("CV style names the saved template it follows", () => {
  const style = styleSummary({ template: "custom", accent: "#0f766e", showPhoto: true, templateRef: "7f0c3a52-3e7e-4a39-9d0e-4c1f0b7f3e11", design: { accent: "#0f766e" } }, "Teal two-column")
  assert.deepEqual(style.savedTemplate, { id: "7f0c3a52-3e7e-4a39-9d0e-4c1f0b7f3e11", name: "Teal two-column" })
  assert.equal(styleSummary({ template: "atlas", accent: "#1d4ed8", showPhoto: false }, null).savedTemplate, null)
})
