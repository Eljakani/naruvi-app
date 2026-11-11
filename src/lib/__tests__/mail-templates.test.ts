import assert from "node:assert/strict"
import { test } from "node:test"
import { composeDraft } from "../mail-templates"

const application = { name: "ليلى", title: "Software Engineer", company: "Acme" }

test("Arabic application drafts mention only the attached documents", () => {
  for (const cv of [false, true]) {
    for (const letter of [false, true]) {
      const draft = composeDraft("apply", "ar", { ...application, attachments: { cv, letter } })
      assert.match(draft.subject, /^التقديم/)
      assert.ok(draft.body.includes(application.title))
      assert.ok(draft.body.includes(application.company))
      assert.equal(draft.body.includes("سيرتي الذاتية"), cv)
      assert.equal(draft.body.includes("رسالة التقديم"), letter)
    }
  }
})

test("Arabic follow-ups, thank-yous and replies preserve the thread subject", () => {
  for (const kind of ["follow_up", "thank_you", "reply"] as const) {
    const draft = composeDraft(kind, "ar", { ...application, subject: "Re: Interview" })
    assert.equal(draft.subject, "Re: Interview")
    assert.match(draft.body, /^مرحبًا/)
    assert.ok(draft.body.endsWith(application.name))
  }
})
