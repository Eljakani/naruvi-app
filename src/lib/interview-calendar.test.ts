import assert from "node:assert/strict"
import test from "node:test"
import { interviewCalendarInput, shouldOfferInterviewCalendar, zonedInterviewStart } from "./interview-calendar"

test("Paris appointment times convert to UTC in winter and summer", () => {
  assert.equal(zonedInterviewStart("2026-11-09T14:00", "Europe/Paris"), "2026-11-09T13:00:00.000Z")
  assert.equal(zonedInterviewStart("2026-07-09T14:00", "Europe/Paris"), "2026-07-09T12:00:00.000Z")
  assert.equal(zonedInterviewStart("2026-11-09T14:00", "America/New_York"), "2026-11-09T19:00:00.000Z")
})

test("missing/invalid times and DST gaps cannot silently become appointments", () => {
  assert.throws(() => zonedInterviewStart("", "Europe/Paris"))
  assert.throws(() => zonedInterviewStart("2026-02-30T14:00", "Europe/Paris"))
  assert.throws(() => zonedInterviewStart("2026-03-29T02:30", "Europe/Paris"))
})

test("calendar proposals follow sent interview replies, not cover letters or application emails", () => {
  assert.equal(shouldOfferInterviewCalendar({ direction: "out", kind: "reply" }, true), true)
  assert.equal(shouldOfferInterviewCalendar({ direction: "in", kind: "interview" }, true), false)
  assert.equal(shouldOfferInterviewCalendar({ direction: "out", kind: "apply" }, true), false)
  assert.equal(shouldOfferInterviewCalendar({ direction: "out", kind: "thank_you" }, true), false)
  assert.equal(shouldOfferInterviewCalendar({ direction: "out", kind: "reply" }, false), false)
})

test("calendar requests require explicit appointment details and valid zones", () => {
  const input = { applicationId: "366990f9-ba48-47fb-bf19-e113ba37792a", messageId: "366990f9-ba48-47fb-bf19-e113ba37792b", start: "2026-11-09T13:00:00.000Z", duration: 60, timeZone: "Europe/Paris", tentative: true, location: "" }
  assert.equal(interviewCalendarInput.safeParse(input).success, true)
  assert.equal(interviewCalendarInput.safeParse({ ...input, timeZone: "Paris" }).success, false)
  assert.equal(interviewCalendarInput.safeParse({ ...input, duration: 0 }).success, false)
  assert.equal(interviewCalendarInput.safeParse({ ...input, start: "next Monday" }).success, false)
})
