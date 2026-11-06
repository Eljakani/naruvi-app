import assert from "node:assert/strict"
import test from "node:test"
import { calendar, fold } from "./ical"

test("events are all-day, escaped and folded", () => {
  const text = calendar("Naruvi", [{ uid: "a@naruvi", date: new Date(2026, 10, 7), summary: "Follow up; Acme, Paris", description: "Line one\nLine two", url: "http://localhost:3000/applications/a", updatedAt: new Date(Date.UTC(2026, 10, 6, 10)) }])
  assert.match(text, /DTSTART;VALUE=DATE:20261107\r\nDTEND;VALUE=DATE:20261108/)
  assert.match(text, /SUMMARY:Follow up\; Acme\\, Paris/)
  assert.match(text, /DESCRIPTION:Line one\\nLine two/)
  assert.match(text, /DTSTAMP:20261106T100000Z/)
  assert.ok(text.endsWith("END:VCALENDAR\r\n"))
})

test("long lines fold at 75 octets without splitting characters", () => {
  const line = `SUMMARY:${"é".repeat(60)}`
  const folded = fold(line)
  for (const part of folded.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75)
  assert.equal(folded.replace(/\r\n /g, ""), line)
})
