import assert from "node:assert/strict"
import { test } from "node:test"
import { decideMatches } from "../../analysis/refine"
import { jevClient, type Decide, type DecisionResult } from "../../decisions/jev"
import { verifyCvRewrites } from "../../documents/verify-docs"
import type { CvDocument } from "../../documents/model"
import { enrichJob, yearsRequired } from "../../jobs/enrich"

const result = (answers: DecisionResult["answers"]): DecisionResult => ({ model: "jev-test", answers, usage: { input_tokens: 10, output_tokens: 1 } })

test("jev client: bearer auth, retries 529, maps 401 without leaking the body", async () => {
  let calls = 0
  let auth = ""
  const fetcher = (async (_url: string, init: RequestInit) => {
    calls += 1
    auth = new Headers(init.headers).get("authorization") ?? ""
    if (calls === 1) return new Response("busy", { status: 529 })
    return Response.json(result({ q: { type: "noul", noul: 0.9 } }))
  }) as typeof fetch
  const decide = jevClient({ apiKey: "k-123", model: "jev-latest" }, { fetcher })
  const answer = await decide("s", { q: { type: "noul", instructions: "x" } })
  assert.equal(calls, 2)
  assert.equal(auth, "Bearer k-123")
  assert.equal(answer.answers.q.type === "noul" && answer.answers.q.noul, 0.9)
  const denied = jevClient({ apiKey: "bad", model: "jev-latest" }, { fetcher: (async () => new Response("secret echo bad", { status: 401 })) as unknown as typeof fetch })
  await assert.rejects(denied("s", { q: { type: "noul", instructions: "x" } }), (error: Error) => !error.message.includes("secret"))
})

test("decision fit review: cites high-probability facts, keeps guards", async () => {
  const base = { kind: "must" as const, section: "", keywords: [], years: null, covered: [], missing: [], note: "", source: "rules" as const }
  const matches = [
    { ...base, id: "r1", text: "Observability", status: "gap" as const, factIds: [] },
    { ...base, id: "r2", text: "Go", status: "met" as const, factIds: ["f2"] },
    { ...base, id: "r3", text: "Rust", status: "gap" as const, factIds: [] },
  ]
  const catalog = [{ id: "f1", statement: "Built Prometheus monitoring", entry: "Oracle", kind: "experience" }, { id: "f2", statement: "Go automation", entry: "Oracle", kind: "experience" }]
  const decide: Decide = async () => result({
    status_r1: { type: "choice", choice: "met", confidence: 0.9, probabilities: { met: 0.9 } },
    fact_r1: { type: "choice", choice: "F1", confidence: 0.8, probabilities: { F1: 0.8, F2: 0.1, none: 0.1 } },
    status_r2: { type: "choice", choice: "gap", confidence: 0.6, probabilities: { gap: 0.6 } },
    fact_r2: { type: "choice", choice: "none", confidence: 0.9, probabilities: { none: 0.9, F2: 0.1 } },
    status_r3: { type: "choice", choice: "partial", confidence: 0.5, probabilities: { partial: 0.5 } },
    fact_r3: { type: "choice", choice: "none", confidence: 0.95, probabilities: { none: 0.95 } },
  })
  const out = await decideMatches(matches, catalog, decide)
  const by = Object.fromEntries(out.matches.map((m) => [m.id, m]))
  assert.equal(by.r1.status, "met")
  assert.deepEqual(by.r1.factIds, ["f1"])
  assert.equal(by.r2.status, "partial", "rule met never drops to gap")
  assert.equal(by.r3.status, "gap", "partial without a cited fact is a gap")
})

test("enrichment: decisions classify, years come from text", async () => {
  assert.equal(yearsRequired("At least 5+ years of experience, ideally 7 years"), 5)
  const decide: Decide = async (_state, questions) => result(Object.fromEntries(Object.keys(questions).map((id) => [id, id === "seniority" ? { type: "choice" as const, choice: "senior", confidence: 0.8, probabilities: {} } : id === "work_mode" ? { type: "choice" as const, choice: "hybrid", confidence: 0.9, probabilities: {} } : id.startsWith("skill_") ? { type: "choice" as const, choice: id === "skill_0" ? "required" : "nice", confidence: 0.7, probabilities: {} } : { type: "choice" as const, choice: "unknown", confidence: 0.5, probabilities: {} }])))
  const insights = await enrichJob({ title: "Engineer", company: "Acme", text: "We need Kubernetes and Terraform. Hybrid in Lyon. 5 years.", language: "en" }, { decide })
  assert.equal(insights.engine, "decisions")
  assert.equal(insights.seniority, "senior")
  assert.equal(insights.workMode, "hybrid")
  assert.equal(insights.skills.required.length, 1)
  assert.equal(insights.visaSponsorship, null)
})

test("verification: unsupported rewrites revert to approved wording", async () => {
  const doc = {
    version: 1, language: "en", template: "classic", accent: "#2563eb", missingTranslations: [],
    header: { name: "A", headline: "", email: "", phone: "", location: "", links: [], photoPath: null, showPhoto: false },
    sections: [{ id: "s", kind: "experience", title: "", included: true, groups: [], items: [{ entryId: "e", title: "", included: true, bullets: [
      { id: "b1", text: "Led the security program", originalText: "Helped with security reviews", factIds: ["f1"], included: true, source: "model" },
      { id: "b2", text: "Automated Go cleanup", originalText: "Wrote Go cleanup scripts", factIds: ["f1"], included: true, source: "model" },
    ] }] }],
  } as unknown as CvDocument
  const decide: Decide = async () => result({ c0: { type: "noul", noul: 0.1 }, c1: { type: "noul", noul: 0.9 } })
  const out = await verifyCvRewrites(doc, [{ id: "e", status: "verified", facts: [{ id: "f1", statement: "Wrote Go cleanup scripts and helped with reviews" }] }] as never, decide)
  const bullets = out.doc.sections[0].items[0].bullets
  assert.equal(bullets[0].text, "Helped with security reviews")
  assert.equal(bullets[1].text, "Automated Go cleanup")
  assert.equal(out.reverted, 1)
})
