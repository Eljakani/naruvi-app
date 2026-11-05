import assert from "node:assert/strict"
import test from "node:test"
import { composeCv, type ComposeEntry } from "../../documents/compose"
import { checkLetter, composeLetter, letterDocument } from "../../documents/letter"
import { cvDocument } from "../../documents/model"
import { checkQuality } from "../../documents/quality"
import { enrichCv, enrichLetter, researchSources, supportedWording } from "../../documents/ai-compose"
import type { CompletionInput } from "../../llm/transport"

const profile = { fullName: "Fictional Candidate", headlines: { en: "Store Manager" }, email: "private@example.test", phone: "private-phone", location: "Lyon", links: [], photoPath: null, defaultLanguage: "en" }
const shop: ComposeEntry = {
  id: "shop", kind: "experience", status: "verified", title: "Shop", display: { en: { role: "Store Manager", organization: "Fresh Market", dates: "2020–2024" } }, skills: [], logoPath: null, sortOrder: 0,
  facts: [{ id: "f1", statement: "Reduced stock losses by 20% through weekly audits." }, { id: "f2", statement: "Managed a team of 12." }],
  phrasings: [
    { id: "p1", group: "Ops", role: "bullet", language: "en", text: "Reduced stock losses by 20% through weekly audits.", factIds: ["f1"], grounding: { grounded: true } },
    { id: "p2", group: "Team", role: "bullet", language: "en", text: "Managed a team of 12.", factIds: ["f2"], grounding: { grounded: true } },
  ],
}
const analysis = { requirements: [{ kind: "must", status: "met", text: "Manage a team", keywords: [], factIds: ["f2"] }], recommendedEntries: [{ entryId: "shop", requirements: 1 }], keywords: [] }
const job = { title: "Retail Supervisor", company: "GreenGrocer", description: "GreenGrocer works with local farms and needs a manager to reduce stock losses and manage staff.", url: "https://greengrocer.example/jobs/1" }
const companySources = [{ text: "GreenGrocer works with local farms.", url: "https://greengrocer.example/about" }]
const cv = () => composeCv(profile, [shop], analysis, { language: "en" })
const letter = () => composeLetter(profile, [shop], { ...analysis, requirements: [...analysis.requirements, { kind: "responsibility", status: "partial", text: "Reduce stock losses", keywords: [], factIds: ["f1"] }] }, job, { language: "en" })
const mock = (value: unknown) => async () => ({ text: JSON.stringify(value), model: "fixture-model", inputTokens: null, outputTokens: null })
const cvAnswer = { language: "en", items: [{ id: "E1", bullets: [{ id: "B1", text: "Led a team of 12." }, { id: "B2", text: "Cut stock losses by 20% through weekly audits." }] }] }
const letterAnswer = {
  language: "en",
  opening: { text: "I am applying for the Retail Supervisor role at GreenGrocer. My experience includes managing a team of 12.", facts: ["F1"], sources: [] },
  motivation: { text: "GreenGrocer's work with local farms connects with my experience reducing stock losses through weekly audits.", facts: ["F1"], sources: ["S1"] },
  closing: { text: "Thank you for considering my application. I would welcome a conversation about the role.", facts: [], sources: [] },
  highlights: [{ id: "H1", text: "Led a team of 12." }],
}

test("CV AI tailors wording while preserving identity, history, citations and original text", async () => {
  const base = cv()
  const next = await enrichCv(base, [shop], analysis, job, mock(cvAnswer))
  assert.equal(next.aiAssistance?.status, "applied")
  assert.equal(next.aiAssistance?.reviewed, false)
  assert.deepEqual(next.header, base.header)
  assert.equal(next.sections[0].items[0].dates, "2020–2024")
  const bullet = next.sections[0].items[0].bullets[0]
  assert.equal(bullet.text, "Led a team of 12.")
  assert.deepEqual(bullet.factIds, ["f2"])
  assert.equal(bullet.originalText, "Managed a team of 12.")
  assert.equal(bullet.source, "model")
  assert.equal(base.sections[0].items[0].bullets[0].source, "phrasing")
  assert.equal(cvDocument.parse(next).aiAssistance?.status, "applied")
})

test("new numbers, years, tools, URLs and email addresses fail the concrete wording checks", () => {
  const source = ["Managed a team of 12."]
  assert.equal(supportedWording("Led a team of 12.", source), true)
  for (const text of ["Led a team of 120.", "Led the team in 2025.", "Managed AWS deployments.", "Visit https://example.com", "Contact x@example.com"]) assert.equal(supportedWording(text, source), false)
})

test("CV rejects invented metrics and model-supplied citations or identities", async () => {
  const proposal = { language: "en", header: { name: "Invented Person" }, items: [{ id: "E1", bullets: [{ id: "B1", text: "Led a team of 900.", factIds: ["invented"] }, { id: "B2", text: "Built AWS services." }, { id: "unknown", text: "Invented." }] }] }
  const result = await enrichCv(cv(), [shop], analysis, job, mock(proposal))
  const bullets = result.sections[0].items[0].bullets
  assert.equal(result.header.name, profile.fullName)
  assert.ok(bullets.every((bullet) => bullet.source !== "model"))
  assert.ok(bullets.every((bullet) => !bullet.factIds.includes("invented")))
})

test("CV refuses a selection that loses previously shown must-have evidence", async () => {
  const base = cv()
  const reply = { language: "en", items: [{ id: "E1", bullets: [{ id: "B2", text: "Cut stock losses by 20% through weekly audits." }] }] }
  const next = await enrichCv(base, [shop], analysis, job, mock(reply))
  assert.equal(next.aiAssistance?.status, "fallback")
  assert.deepEqual(next.sections, base.sections)
})

test("invalid schema, wrong language, unknown ids, and provider failure keep the grounded baseline", async () => {
  for (const complete of [mock({ text: "not the schema" }), mock({ ...cvAnswer, language: "fr" }), mock({ language: "en", items: [{ id: "fake-entry", bullets: [{ id: "fake", text: "Fake" }] }] }), async () => { throw new Error("provider unavailable") }]) {
    const base = cv()
    const next = await enrichCv(base, [shop], analysis, job, complete)
    assert.equal(next.aiAssistance?.status, "fallback")
    assert.deepEqual(next.sections, base.sections)
  }
})

test("no verified evidence means no document model call", async () => {
  const unverified = { ...shop, status: "needs_review" }
  let calls = 0
  const complete = async () => { calls += 1; throw new Error("must not call") }
  assert.match((await enrichCv(cv(), [unverified], analysis, job, complete)).aiAssistance!.reason!, /skipped/)
  assert.match((await enrichLetter(letter(), [unverified], job, companySources, complete)).aiAssistance!.reason!, /skipped/)
  assert.equal(calls, 0)
})

test("a valid unchanged selection records AI use without claiming a rewrite or needing review", async () => {
  const base = cv()
  const original = base.sections[0].items[0].bullets
  const next = await enrichCv(base, [shop], analysis, job, mock({ language: "en", items: [{ id: "E1", bullets: original.map((bullet, index) => ({ id: `B${index + 1}`, text: bullet.text })) }] }))
  assert.equal(next.aiAssistance?.status, "unchanged")
  assert.equal(next.aiAssistance?.model, "fixture-model")
  assert.equal(checkQuality(next, 1).ready, true)
})

test("letter AI drafts source-linked paragraphs and highlights without sending contact details", async () => {
  const base = letter()
  // The first highlight cites f2, so F1 is f2; use F2 for the stock-loss motivation.
  const proposal = { ...letterAnswer, motivation: { ...letterAnswer.motivation, facts: ["F2"] } }
  const complete = async (input: CompletionInput) => {
    for (const secret of [profile.fullName, profile.email, profile.phone]) assert.ok(!input.user.includes(secret))
    assert.match(input.system, /UNTRUSTED DATA/)
    return mock(proposal)()
  }
  const next = await enrichLetter(base, [shop], job, companySources, complete)
  assert.equal(next.aiAssistance?.status, "applied")
  assert.equal(next.paragraphs.find((p) => p.kind === "motivation")?.placeholder, false)
  assert.deepEqual(next.paragraphs.find((p) => p.kind === "motivation")?.factIds, ["f1"])
  assert.deepEqual(next.paragraphs.find((p) => p.kind === "motivation")?.sourceUrls, [companySources[0].url])
  assert.equal(next.highlights[0].text, "Led a team of 12.")
  assert.equal(next.highlights[0].originalText, "Managed a team of 12.")
  assert.deepEqual(next.header, base.header)
  assert.equal(letterDocument.parse(next).aiAssistance?.status, "applied")
})

test("letter rejects unknown citations, invented metrics and numbers copied from the job", async () => {
  for (const motivation of [
    { text: "I managed 900 colleagues.", facts: ["F1"], sources: ["J1"] },
    { text: "I managed a team of 12.", facts: ["invented"], sources: ["S1"] },
    { text: "My experience aligns with the company.", facts: ["F1"], sources: ["invented"] },
  ]) {
    const base = letter()
    const next = await enrichLetter(base, [shop], { ...job, description: "Manage 900 colleagues." }, companySources, mock({ ...letterAnswer, motivation }))
    assert.equal(next.paragraphs.find((p) => p.kind === "motivation")?.placeholder, true)
  }
})

test("letter keeps a personal motivation already supplied by the user", async () => {
  const base = letter()
  const personal = base.paragraphs.find((p) => p.kind === "motivation")!
  personal.text = "I want to work locally so I can stay close to my family."
  personal.placeholder = false
  const next = await enrichLetter(base, [shop], job, companySources, mock(letterAnswer))
  assert.equal(next.paragraphs.find((p) => p.kind === "motivation")?.text, personal.text)
})

test("AI drafts require review before quality gates can mark them ready", async () => {
  const tailored = await enrichCv(cv(), [shop], analysis, job, mock(cvAnswer))
  assert.equal(checkQuality(tailored, 1).ready, false)
  tailored.aiAssistance!.reviewed = true
  assert.equal(checkQuality(tailored, 1).ready, true)
  const drafted = await enrichLetter(letter(), [shop], job, companySources, mock({ ...letterAnswer, motivation: { ...letterAnswer.motivation, facts: ["F2"] } }))
  assert.equal(checkLetter(drafted, 1).ready, false)
  drafted.aiAssistance!.reviewed = true
  assert.equal(checkLetter(drafted, 1).ready, true)
})

test("company research contributes only source-linked text", () => {
  assert.deepEqual(researchSources({ about: [{ text: "Company mission.", source: "https://example.com/about" }, { text: "Unsourced.", source: "job posting" }] }), [{ text: "Company mission.", url: "https://example.com/about" }])
  assert.deepEqual(researchSources(null), [])
})
