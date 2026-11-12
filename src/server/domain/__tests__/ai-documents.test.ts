import assert from "node:assert/strict"
import test from "node:test"
import { composeCv, type ComposeEntry } from "../../documents/compose"
import { checkLetter, composeLetter, letterDocument } from "../../documents/letter"
import { cvDocument } from "../../documents/model"
import { checkQuality } from "../../documents/quality"
import { enrichCv, enrichLetter, researchSources, reviewCvTailoring, supportedWording } from "../../documents/ai-compose"
import type { CompletionInput } from "../../llm/transport"

const profile = { fullName: "Fictional Candidate", headlines: { en: "Store Manager" }, email: "private@example.test", phone: "private-phone", location: "Lyon", links: [], photoPath: null, defaultLanguage: "en" }
const shop: ComposeEntry = {
  id: "shop", kind: "experience", status: "verified", display: { en: { position: "Store Manager" } }, fields: { company: "Fresh Market", dates: { start: "2020", end: "2024" } }, skills: [], logoPath: null, sortOrder: 0,
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
  opening: "I’d like to apply for the Retail Supervisor role at GreenGrocer.",
  motivation: "I’d like to work closer to home. Having more time with my family matters to me.",
  closing: "Thank you for reading. I’d be glad to talk.",
}
const authorNotes = "I want to work closer to home to spend more time with my family."

test("CV AI tailors wording while preserving identity, history, citations and original text", async () => {
  const base = cv()
  const next = await enrichCv(base, [shop], analysis, job, mock(cvAnswer))
  assert.equal(next.aiAssistance?.status, "applied")
  assert.equal(next.aiAssistance?.reviewed, false)
  assert.deepEqual(next.header, base.header)
  assert.equal(next.sections[0].items[0].dates, "2020 – 2024")
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

test("CV editorial review keeps only supported material improvements", async () => {
  const base = cv()
  const tailored = await enrichCv(base, [shop], analysis, job, mock(cvAnswer))
  const [lead, stock] = tailored.sections[0].items[0].bullets
  const result = await reviewCvTailoring(base, tailored, [shop], job, mock({ decisions: [
    { id: lead.id, keep: false },
    { id: stock.id, keep: true },
  ] }))
  assert.equal(result.accepted, 1)
  assert.equal(result.rejected, 1)
  assert.equal(result.doc.sections[0].items[0].bullets[0].text, "Managed a team of 12.")
  assert.equal(result.doc.sections[0].items[0].bullets[0].originalText, undefined)
  assert.equal(result.doc.sections[0].items[0].bullets[1].text, stock.text)
})

test("CV tailoring skips punctuation-only rewrites", async () => {
  const base = cv()
  const bullets = base.sections[0].items[0].bullets
  const result = await enrichCv(base, [shop], analysis, job, mock({
    language: "en",
    items: [{ id: "E1", bullets: bullets.map((bullet, index) => ({ id: `B${index + 1}`, text: bullet.text.replace(/\.$/, "!") })) }],
  }))
  assert.deepEqual(result.sections, base.sections)
  assert.equal(result.aiAssistance?.status, "unchanged")
})

test("CV rejects invented metrics and model-supplied citations or identities", async () => {
  const proposal = { language: "en", header: { name: "Invented Person" }, items: [{ id: "E1", bullets: [{ id: "B1", text: "Led a team of 900.", factIds: ["invented"] }, { id: "B2", text: "Built AWS services." }, { id: "unknown", text: "Invented." }] }] }
  const result = await enrichCv(cv(), [shop], analysis, job, mock(proposal))
  const bullets = result.sections[0].items[0].bullets
  assert.equal(result.header.name, profile.fullName)
  assert.ok(bullets.every((bullet) => bullet.source !== "model"))
  assert.ok(bullets.every((bullet) => !bullet.factIds.includes("invented")))
})

test("CV puts back must-have evidence the AI dropped, keeping the rest of its work", async () => {
  const base = cv()
  const reply = { language: "en", items: [{ id: "E1", bullets: [{ id: "B2", text: "Cut stock losses by 20% through weekly audits." }] }] }
  const next = await enrichCv(base, [shop], analysis, job, mock(reply))
  const shownBefore = new Set(base.sections.flatMap((s) => s.items.flatMap((i) => i.bullets.filter((b) => b.included).flatMap((b) => b.factIds))))
  const shownAfter = new Set(next.sections.flatMap((s) => s.items.flatMap((i) => i.bullets.filter((b) => b.included).flatMap((b) => b.factIds))))
  for (const requirement of analysis.requirements.filter((r) => r.kind === "must" && r.factIds.some((id) => shownBefore.has(id)))) {
    assert.ok(requirement.factIds.some((id) => shownAfter.has(id)), "must-have evidence still shown")
  }
  assert.notEqual(next.aiAssistance?.status, "fallback")
})

test("invalid schema, wrong language, unknown ids, and provider failure keep the grounded baseline", async () => {
  for (const complete of [mock({ text: "not the schema" }), mock({ ...cvAnswer, language: "fr" }), mock({ language: "en", items: [{ id: "fake-entry", bullets: [{ id: "fake", text: "Fake" }] }] }), async () => { throw new Error("provider unavailable") }]) {
    const base = cv()
    const next = await enrichCv(base, [shop], analysis, job, complete)
    assert.equal(next.aiAssistance?.status, "fallback")
    assert.deepEqual(next.sections, base.sections)
  }
})

test("no verified evidence means no CV model call", async () => {
  const unverified = { ...shop, status: "needs_review" }
  let calls = 0
  const complete = async () => { calls += 1; throw new Error("must not call") }
  assert.match((await enrichCv(cv(), [unverified], analysis, job, complete)).aiAssistance!.reason!, /skipped/)
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

test("letter drafts from the author's reasons without CV evidence or contact details", async () => {
  const base = { ...letter(), authorNotes }
  const complete = async (input: CompletionInput) => {
    for (const secret of [profile.fullName, profile.email, profile.phone, "Managed a team of 12."]) assert.ok(!input.user.includes(secret))
    assert.equal(JSON.parse(input.user).authorNotes, authorNotes)
    return mock(letterAnswer)()
  }
  const next = await enrichLetter(base, job, companySources, complete)
  assert.equal(next.aiAssistance?.status, "applied")
  assert.equal(next.paragraphs.find((p) => p.kind === "motivation")?.text, letterAnswer.motivation)
  assert.ok(next.paragraphs.every((p) => p.kind !== "highlights"))
  assert.deepEqual(next.highlights, [])
  assert.deepEqual(next.header, base.header)
  assert.equal(letterDocument.parse(next).aiAssistance?.status, "applied")
})

test("letter drafts a complete motivation from the posting without author notes", async () => {
  const motivation = "The focus on reducing stock losses through better day-to-day store operations drew me to the role."
  const next = await enrichLetter(letter(), job, companySources, mock({ ...letterAnswer, motivation }))
  assert.equal(next.aiAssistance?.status, "applied")
  assert.equal(next.paragraphs.find((p) => p.kind === "motivation")?.text, motivation)
  assert.ok(next.paragraphs.every((p) => !p.placeholder))
})

test("letter applies the editorial pass while retaining the role-specific reason", async () => {
  const motivation = "The focus on reducing stock losses drew me to the role."
  const first = { ...letterAnswer, motivation, closing: "Thank you for taking the time to read my application." }
  const next = await enrichLetter(letter(), job, companySources, async (input) => {
    const payload = JSON.parse(input.user)
    return mock(payload.draft ? { ...first, closing: "Thank you for reading." } : first)()
  })
  assert.equal(next.paragraphs.find((p) => p.kind === "motivation")?.text, motivation)
  assert.equal(next.paragraphs.find((p) => p.kind === "closing")?.text, "Thank you for reading.")
})

test("letter rejects generated lists and metrics copied from the job", async () => {
  for (const motivation of ["- Work locally\n- Spend more time with family", "I managed 900 colleagues."]) {
    const base = { ...letter(), authorNotes }
    const next = await enrichLetter(base, { ...job, description: "Manage 900 colleagues." }, companySources, mock({ ...letterAnswer, motivation }))
    assert.equal(next.aiAssistance?.status, "fallback")
    assert.deepEqual(next.paragraphs, base.paragraphs)
  }
})

test("letter keeps a personal motivation already supplied by the user when no rewrite was requested", async () => {
  const base = letter()
  const personal = base.paragraphs.find((p) => p.kind === "motivation")!
  personal.text = "I want to work locally so I can stay close to my family."
  personal.placeholder = false
  const next = await enrichLetter(base, job, companySources, mock(letterAnswer))
  assert.equal(next.paragraphs.find((p) => p.kind === "motivation")?.text, personal.text)
})

test("AI drafts require review before quality gates can mark them ready", async () => {
  const tailored = await enrichCv(cv(), [shop], analysis, job, mock(cvAnswer))
  assert.equal(checkQuality(tailored, 1).ready, false)
  tailored.aiAssistance!.reviewed = true
  assert.equal(checkQuality(tailored, 1).ready, true)
  const drafted = await enrichLetter({ ...letter(), authorNotes }, job, companySources, mock(letterAnswer))
  assert.equal(checkLetter(drafted, 1).ready, false)
  drafted.aiAssistance!.reviewed = true
  assert.equal(checkLetter(drafted, 1).ready, true)
})

test("company research contributes only source-linked text", () => {
  assert.deepEqual(researchSources({ about: [{ text: "Company mission.", source: "https://example.com/about" }, { text: "Unsourced.", source: "job posting" }] }), [{ text: "Company mission.", url: "https://example.com/about" }])
  assert.deepEqual(researchSources(null), [])
})
