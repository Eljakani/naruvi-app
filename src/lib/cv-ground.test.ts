import assert from "node:assert/strict"
import { test } from "node:test"
import { groundDates, groundIdentity, groundLevel, groundLink, groundMonth, namesMonth, sourceLinks, unreadLines } from "./cv-ground"

const cv = `Ana Silva
Backend Engineer · Leeds, United Kingdom
ana.silva@example.org · +44 7700 900123 · github.com/anasilva-dev

Experience
Senior Engineer — Monzo, London
Mar 2021 – Present
• Cut p99 latency from 480 ms to 120 ms.
Intern — Arm, Cambridge
été 2017

Languages
English (native), French (B2), Yoruba (conversational), Welsh`
const hidden = [{ text: "LinkedIn", url: "https://www.linkedin.com/in/ana-silva-dev" }]

test("links: only addresses the CV has; a shortened one is completed, an invented one dropped", () => {
  const allowed = sourceLinks(cv, hidden)
  assert.deepEqual(allowed, ["https://www.linkedin.com/in/ana-silva-dev", "https://github.com/anasilva-dev"])
  assert.equal(groundLink("https://linkedin.com/in/ana-silva-dev/", allowed), "https://www.linkedin.com/in/ana-silva-dev")
  assert.equal(groundLink("https://www.linkedin.com/", allowed), "https://www.linkedin.com/in/ana-silva-dev")
  assert.equal(groundLink("https://www.linkedin.com/in/ana-silva", allowed), "https://www.linkedin.com/in/ana-silva-dev")
  assert.equal(groundLink("https://www.linkedin.com/in/someone-else", allowed), null)
  assert.equal(groundLink("https://anasilva.dev", allowed), null)
})

test("identity: the CV's own address, number and links; what isn't in the text is cleared", () => {
  const identity = groundIdentity({ fullName: "Ana Silva", headline: "Staff Platform Architect", summary: "", email: "ana@silva.example", phone: "07700 900123", location: "Leeds, United Kingdom", links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/a-silva" }, { label: "Site", url: "https://anasilva.dev" }] }, cv, hidden)
  assert.equal(identity.email, "ana.silva@example.org")
  assert.equal(identity.phone, "+44 7700 900123")
  assert.equal(identity.headline, "")
  assert.equal(identity.location, "Leeds, United Kingdom")
  assert.deepEqual(identity.links, [{ label: "LinkedIn", url: "https://www.linkedin.com/in/ana-silva-dev" }, { label: "GitHub", url: "https://github.com/anasilva-dev" }])
})

test("dates: the CV's wording wins; a month the text doesn't name is dropped; years not in the CV drop the dates", () => {
  assert.deepEqual(groundDates({ start: "2021-04", end: "2023-01" }, "Mar 2021 – Present", cv), { start: "2021-03", end: "present" })
  assert.deepEqual(groundDates({ start: "2017-06", end: "2017-08" }, "été 2017", cv), { start: "2017" })
  assert.deepEqual(groundDates({ start: "2017-06" }, "", cv), { start: "2017-06" })
  assert.equal(groundDates({ start: "2015", end: "2019" }, "", cv), undefined)
  assert.equal(groundDates(undefined, "", cv), undefined)
  assert.deepEqual(groundMonth("2021-03", "", cv), { point: "2021-03", end: undefined })
  assert.equal(namesMonth("été 2024"), false)
  assert.equal(namesMonth("03/2022"), true)
  assert.equal(namesMonth("mars 2022"), true)
})

test("level: from the CV's wording, found beside the language when the model copied nothing, never guessed", () => {
  assert.deepEqual(groundLevel({ level: "C2" }, "conversational", cv), { level: "B1" })
  assert.deepEqual(groundLevel({ level: "B2" }, "", cv, "French"), { level: "B2" })
  assert.deepEqual(groundLevel({ level: "C1" }, "", cv, "Yoruba"), { level: "B1" })
  assert.deepEqual(groundLevel({ level: "B2" }, "", cv, "Welsh"), {})
  assert.deepEqual(groundLevel({ level: "B2", test: "TOEFL 110" }, "", cv, "English"), { level: "native" })
})

test("unread: lines in no entry are reported; titles, contact lines and dates are not", () => {
  const identity = { fullName: "Ana Silva", headline: "Backend Engineer", summary: "", email: "ana.silva@example.org", phone: "", location: "Leeds, United Kingdom", links: [] }
  const entries = [{ text: { position: "Senior Engineer", location: "London" }, fields: { company: "Monzo" }, facts: ["Cut p99 latency from 480 ms to 120 ms."], skills: [], bullets: [] }]
  assert.deepEqual(unreadLines(cv, identity, entries), ["Intern — Arm, Cambridge", "English (native), French (B2), Yoruba (conversational), Welsh"])
  assert.deepEqual(unreadLines(cv, identity, entries, ["English (native), French (B2), Yoruba (conversational), Welsh", "Intern Arm Cambridge"]), [])
})
