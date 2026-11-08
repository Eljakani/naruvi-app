import assert from "node:assert/strict"
import { test } from "node:test"
import { fixableProblems, runCvAgent, type Evaluation } from "../../documents/cv-agent"
import type { CvDocument } from "../../documents/model"

const doc = (pages: number) => ({ id: pages }) as unknown as CvDocument
const evaluation = (pages: number, score: number, extra: Evaluation["quality"]["checks"] = []): Evaluation => ({
  pages,
  quality: { score, errors: pages > 2 ? 1 : 0, warnings: 0, pages, ready: pages <= 2, checks: [{ id: "pages", status: pages > 2 ? "fail" : "pass", label: "Fits the page budget", detail: `${pages} pages` }, ...extra] } as never,
})

test("only fixable problems are fed back", () => {
  const problems = fixableProblems(evaluation(3, 60, [{ id: "contact", status: "fail", label: "Contact details", detail: "missing" }, { id: "length", status: "warn", label: "Scannable bullets", detail: "2 long" }]))
  assert.equal(problems.length, 2)
  assert.ok(problems.every((problem) => !problem.includes("Contact")))
})

test("the loop keeps revising until the checks pass and keeps the best", async () => {
  const instructions: string[] = []
  const result = await runCvAgent(doc(3), {}, {
    evaluate: async (d) => evaluation((d as unknown as { id: number }).id, 90 - (d as unknown as { id: number }).id * 10),
    revise: async (d, instruction) => { instructions.push(instruction); return { doc: doc((d as unknown as { id: number }).id - 1), changed: 2, rejected: 0, note: "Trimmed" } },
  })
  assert.equal(result.pages, 2)
  assert.equal(result.improved, true)
  assert.equal(instructions.length, 1, "stops once nothing fixable is left")
  assert.match(instructions[0], /Fits the page budget: 3 pages/)
})

test("a request that makes things clearly worse is not kept", async () => {
  const start = doc(1)
  const result = await runCvAgent(start, { request: "add more detail", maxRounds: 1 }, {
    evaluate: async (d) => evaluation((d as unknown as { id: number }).id, (d as unknown as { id: number }).id === 1 ? 90 : 40),
    revise: async () => ({ doc: doc(3), changed: 5, rejected: 0, note: "Added detail" }),
  })
  assert.equal(result.doc, start)
  assert.equal(result.improved, false)
})

test("page targets are read from the request", async () => {
  const { pageTarget } = await import("../../documents/cv-agent")
  assert.equal(pageTarget("Fit on one page"), 1)
  assert.equal(pageTarget("tiens sur une seule page"), 1)
  assert.equal(pageTarget("max 2 pages please"), 2)
  assert.equal(pageTarget("stress leadership"), null)
})

test("trim candidates never touch must-have evidence or an entry's only line", async () => {
  const { trimCandidates } = await import("../../documents/cv-agent")
  const b = (id: string, facts: string[]) => ({ id, text: "x".repeat(80), factIds: facts, included: true })
  const cv = { sections: [{ kind: "experience", included: true, items: [
    { included: true, bullets: [b("a1", ["f1"]), b("a2", ["must"]), b("a3", ["f3"])] },
    { included: true, bullets: [b("b1", ["f4"])] },
  ] }] } as never
  const ids = trimCandidates(cv, new Set(["must"])).map((c) => `${c.item}:${c.bullet}`)
  assert.deepEqual(ids, ["0:2"])
})

test("an edit that only resets the AI-review approval is not counted as worse", async () => {
  // Approved CV with one long bullet (94); the fix removes the warning but un-approves the AI wording (80).
  const start = doc(2)
  const fixed = doc(2.5 as never)
  const result = await runCvAgent(start, { request: "Shorten every bullet longer than 240 characters", maxRounds: 1 }, {
    evaluate: async (d) => d === start
      ? evaluation(2, 94, [{ id: "length", status: "warn", label: "Scannable bullets", detail: "1 long" }])
      : evaluation(2, 80, [{ id: "ai-review", status: "fail", label: "AI wording reviewed", detail: "Review it" }]),
    revise: async () => ({ doc: fixed, changed: 1, rejected: 0, note: "Shortened one bullet" }),
  })
  assert.equal(result.doc, fixed)
  assert.equal(result.improved, true)
})
