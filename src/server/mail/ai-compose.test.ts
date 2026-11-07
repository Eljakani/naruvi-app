import assert from "node:assert/strict"
import test from "node:test"
import { draftMailInput } from "@/lib/mail-draft"
import { writeMailDraft, type MailDraftContext } from "./ai-compose"

const input = draftMailInput.parse({ applicationId: "366990f9-ba48-47fb-bf19-e113ba37792a", kind: "reply", replyTo: "366990f9-ba48-47fb-bf19-e113ba37792b", subject: "Re: Interview invitation", instructions: "I can meet next Monday afternoon, Paris time.", attachCv: false, attachLetter: false })
const context: MailDraftContext = { name: "Alex", company: "Brisk", title: "Software Engineer", language: "en", status: "interviewing", nextStep: "Reply with availability", notes: "private note", jobText: "Role description", today: "2026-11-07", thread: [{ direction: "in", sender: "Recruiter", subject: "Interview invitation", text: "Could you share your availability?", date: "2026-11-07" }], facts: [{ statement: "Built TypeScript applications.", restrictions: ["Do not claim team leadership"] }] }
const reply = { subject: "A model-rewritten subject", body: "Hello,\n\nThank you for inviting me. I can meet Monday afternoon, Paris time.\n\nAlex", missingDetails: [] }

test("drafting receives actual thread, stage, candidate details and selected attachments; preserves a reply subject", async () => {
  const draft = await writeMailDraft(input, context, async (request) => {
    const prompt = JSON.parse(request.user)
    assert.equal(prompt.purpose, "reply")
    assert.equal(prompt.context.company, "Brisk")
    assert.equal(prompt.context.status, "interviewing")
    assert.equal(prompt.context.thread[0].text, context.thread[0].text)
    assert.deepEqual(prompt.selectedAttachments, { cv: false, coverLetter: false })
    assert.match(prompt.candidateInstructions, /next Monday/)
    return { text: JSON.stringify(reply), model: "test", inputTokens: 1, outputTokens: 1 }
  })
  assert.equal(draft.subject, "Re: Interview invitation")
  assert.equal(draft.body, reply.body)
})

test("long thread and posting inputs are bounded and chronological", async () => {
  await writeMailDraft(draftMailInput.parse({ ...input, kind: "apply", replyTo: null }), { ...context, jobText: "x".repeat(10_000), thread: Array.from({ length: 20 }, (_, i) => ({ ...context.thread[0], text: "x".repeat(10_000), subject: String(i) })) }, async (request) => {
    const prompt = JSON.parse(request.user)
    assert.equal(prompt.context.thread.length, 8)
    assert.equal(prompt.context.thread[0].subject, "12")
    assert.equal(prompt.context.thread[7].subject, "19")
    assert.equal(prompt.context.thread[0].text.length, 5000)
    assert.equal(prompt.context.jobText.length, 6000)
    return { text: JSON.stringify(reply), model: "test", inputTokens: 1, outputTokens: 1 }
  })
})

test("invalid or empty model output is rejected instead of replacing the editor", async () => {
  await assert.rejects(writeMailDraft(input, context, async () => ({ text: JSON.stringify({ ...reply, body: "" }), model: "test", inputTokens: 0, outputTokens: 0 })))
})

test("invalid user input is rejected before generation", () => {
  assert.equal(draftMailInput.safeParse({ ...input, kind: "cover_letter" }).success, false)
  assert.equal(draftMailInput.safeParse({ ...input, applicationId: "wrong" }).success, false)
  assert.equal(draftMailInput.safeParse({ ...input, instructions: "x".repeat(4001) }).success, false)
})

test("an interview reply gets no facts or posting, so it can't re-pitch the candidate", async () => {
  const invite = { ...context, thread: [{ direction: "in", sender: "Recruiter", subject: "Interview invitation", text: "We would like to invite you to an interview next week. Could you share your availability?", date: "2026-11-07" }] }
  await writeMailDraft(input, invite, async (request) => {
    const prompt = JSON.parse(request.user)
    assert.equal(prompt.answering, "interview")
    assert.match(prompt.approach, /Do NOT restate experience/)
    assert.deepEqual(prompt.context.facts, [])
    assert.equal(prompt.context.jobText, "")
    return { text: JSON.stringify(reply), model: "test", inputTokens: 1, outputTokens: 1 }
  })
})

test("an application email still gets verified facts and their restrictions", async () => {
  const apply = draftMailInput.parse({ ...input, kind: "apply", replyTo: null })
  await writeMailDraft(apply, context, async (request) => {
    const prompt = JSON.parse(request.user)
    assert.equal(prompt.answering, "apply")
    assert.deepEqual(prompt.context.facts[0].restrictions, ["Do not claim team leadership"])
    assert.equal(prompt.context.jobText, "Role description")
    return { text: JSON.stringify(reply), model: "test", inputTokens: 1, outputTokens: 1 }
  })
})

test("the stored classification wins over a subject that still says Interview", async () => {
  const offer = { ...context, thread: [{ direction: "in", sender: "HR", subject: "Re: Interview invitation", text: "After the interview we decided to give you the job.", date: "2026-11-07", kind: "offer" }] }
  await writeMailDraft(input, offer, async (request) => {
    assert.equal(JSON.parse(request.user).answering, "offer")
    return { text: JSON.stringify(reply), model: "test", inputTokens: 1, outputTokens: 1 }
  })
})
