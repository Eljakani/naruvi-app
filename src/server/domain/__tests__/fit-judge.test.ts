import assert from "node:assert/strict"
import test from "node:test"
import { MockLanguageModelV3 } from "ai/test"
import { judgeMatches, timelineText, type JudgeFact } from "../../analysis/judge"
import type { RequirementMatch } from "../../analysis/match"

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } }
const call = (toolName: string, input: unknown, id = toolName) => ({
  content: [{ type: "tool-call" as const, toolCallId: id, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
  usage,
  warnings: [],
})
const reasons = (text: string) => ({ reason_en: text, reason_fr: `FR ${text}`, reason_ar: `AR ${text}` })

const requirement = (id: string, text: string, status: RequirementMatch["status"], factIds: string[] = [], missing: string[] = []): RequirementMatch => ({
  id, text, kind: "must", section: "Profil", keywords: [], years: null, status, factIds, covered: [], missing, note: "rule note", source: "rules",
})

// Invented profile: an engineering school, a cross-functional job, a side project.
const catalog: JudgeFact[] = [
  { id: "fact-school", statement: "Master's degree in computer science at École Exemple", entry: "École Exemple", kind: "education" },
  { id: "fact-team", statement: "Worked with product, design and security teams on releases", entry: "Acme", kind: "experience" },
  { id: "fact-ai", statement: "Built an open-source assistant that uses language models", entry: "Side project", kind: "project" },
]

test("the judge looks things up, reasons over the facts and records verdicts in three languages", async () => {
  const lookups: string[] = []
  const model = new MockLanguageModelV3({
    doGenerate: [
      call("lookup_public", { name: "École Exemple", language: "fr" }),
      call("record_verdicts", {
        verdicts: [
          { id: "r1", status: "met", facts: ["F1"], ...reasons("École Exemple is a grande école."), sources: ["École Exemple"] },
          { id: "r2", status: "met", facts: ["F2"], ...reasons("Cross-team work shows it.") },
          { id: "r3", status: "met", facts: ["F3"], ...reasons("Builds AI tools.") },
        ],
      }),
    ],
  })
  const matches = [
    requirement("r1", "Diplômé d'une grande école d'ingénieur", "partial", ["fact-school"]),
    requirement("r2", "Tu aimes travailler en équipe, avec pédagogie", "partial", [], ["Teaching"]),
    requirement("r3", "Tu es promoteur de l'IA", "partial"),
  ]
  const result = await judgeMatches(matches, catalog, {
    model,
    lookup: async (name) => (lookups.push(name), { title: "École Exemple", summary: "A French grande école of engineering.", url: "https://fr.wikipedia.org/wiki/%C3%89cole_Exemple" }),
  })
  assert.deepEqual(lookups, ["École Exemple"])
  assert.equal(result.reviewed, 3)
  assert.deepEqual(result.matches.map((match) => match.status), ["met", "met", "met"])
  const [school, team] = result.matches
  assert.deepEqual(school.factIds, ["fact-school"])
  assert.equal(school.reasons?.fr, "FR École Exemple is a grande école.")
  assert.deepEqual(school.sources, [{ title: "École Exemple", url: "https://fr.wikipedia.org/wiki/%C3%89cole_Exemple" }])
  // A proven requirement drops the rule's contradicting "missing" chip and its rule note.
  assert.deepEqual(team.missing, [])
  assert.equal(team.notes, undefined)
  assert.equal(team.source, "model")
})

test("the judge can't claim more than the facts show", async () => {
  const model = new MockLanguageModelV3({
    doGenerate: [
      call("record_verdicts", {
        verdicts: [
          // Proven without citing a fact: not allowed.
          { id: "r1", status: "met", facts: [], ...reasons("Trust me.") },
          // Cites a fact that doesn't exist.
          { id: "r2", status: "met", facts: ["F99"], ...reasons("Invented.") },
          // Tries to turn a rule-proven requirement into a gap.
          { id: "r3", status: "gap", facts: [], ...reasons("Nothing.") },
          // Not part of this batch.
          { id: "r9", status: "met", facts: ["F1"], ...reasons("Stray.") },
        ],
      }),
    ],
  })
  const matches = [requirement("r1", "Kubernetes in production", "gap"), requirement("r2", "Go", "partial"), requirement("r3", "Teamwork", "met", ["fact-team"])]
  const result = await judgeMatches(matches, catalog, { model })
  assert.deepEqual(result.matches.map((match) => match.status), ["gap", "gap", "partial"])
  assert.deepEqual(result.matches[2].factIds, ["fact-team"])
  assert.equal(result.matches.length, 3)
})

test("a verdict that contradicts its own reason, or a range the candidate exceeds, is corrected", async () => {
  const model = new MockLanguageModelV3({
    doGenerate: [
      call("record_verdicts", {
        verdicts: [
          { id: "r1", status: "met", facts: ["F2"], ...reasons("You refactored and shipped code, but no fact shows automated tests.") },
          { id: "r2", status: "gap", facts: [], ...reasons("You are slightly above the range.") },
        ],
      }),
    ],
  })
  const matches = [requirement("r1", "Code de qualité avec tests et refactoring", "partial"), requirement("r2", "Tu as entre 0 et 2 ans d'expérience", "judgement")]
  const result = await judgeMatches(matches, catalog, { model })
  assert.deepEqual(result.matches.map((match) => match.status), ["partial", "judgement"])
})

test("a model that never records a verdict leaves the rule results", async () => {
  const model = new MockLanguageModelV3({ doGenerate: { content: [{ type: "text", text: "I think it's fine." }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] } })
  const matches = [requirement("r1", "Python", "partial", ["fact-ai"])]
  const result = await judgeMatches(matches, catalog, { model })
  assert.equal(result.reviewed, 0)
  assert.equal(result.failedBatches, 1)
  assert.deepEqual(result.matches, matches)
})

test("overlapping jobs count once, and \"present\" runs to today", () => {
  const text = timelineText([
    { kind: "experience", title: "Gamma", start: "2023-03", end: "2025-01", employment: "freelance" },
    { kind: "experience", title: "Delta", start: "2023-11", end: "2025-04", employment: "freelance" },
    { kind: "experience", title: "Epsilon", start: "2025-12", end: "present", employment: "full-time" },
  ], new Date("2026-01-15"))
  // 2023-03 → 2025-04 is 26 months, plus Dec and Jan: 28 months.
  assert.match(text, /about 2.3 years/)
  assert.match(text, /Epsilon: 2025-12 → now \(2 months\)/)
})

test("the timeline counts professional years from real dates, without internships", () => {
  const text = timelineText([
    { kind: "experience", title: "Acme", start: "2023-01", end: "2024-12", employment: "full-time" },
    { kind: "experience", title: "Beta", start: "2022-06", end: "2022-08", employment: "internship" },
    { kind: "education", title: "École Exemple", start: "2018", end: "2022", employment: "" },
  ], new Date("2026-01-01"))
  assert.match(text, /Acme: 2023-01 → 2024-12 \(24 months\)/)
  assert.match(text, /about 2 years/)
})
