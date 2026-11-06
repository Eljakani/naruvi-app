import assert from "node:assert/strict"
import test from "node:test"
import { baseDomain, matchMessage, mentions, type MatchCandidate } from "./mail-match"
import { providerFor } from "./mail-providers"

const apps: MatchCandidate[] = [
  { applicationId: "dash-staff", company: "Dashlane", website: "https://www.dashlane.com", title: "Staff Product Security Engineer", sentMessageIds: ["<sent-1@naruvi>"], active: true, updatedAt: 2 },
  { applicationId: "dash-swe", company: "Dashlane", website: "https://www.dashlane.com", title: "Software Engineer - Security Features", sentMessageIds: [], active: true, updatedAt: 1 },
  { applicationId: "apple", company: "Apple", website: "https://www.apple.com", title: "Internship - Apple Services", sentMessageIds: [], active: true, updatedAt: 3 },
]
const msg = (patch: Partial<Parameters<typeof matchMessage>[0]>) => ({ fromAddress: "x@example.org", fromName: "", subject: "", text: "", ...patch })

test("a reply to mail sent from Naruvi is certain", () => {
  const match = matchMessage(msg({ inReplyTo: "<sent-1@naruvi>", fromAddress: "someone@gmail.com" }), apps)
  assert.equal(match?.applicationId, "dash-staff")
  assert.equal(match?.confidence, 1)
})

test("the company domain matches, and the role in the subject picks between two applications", () => {
  const match = matchMessage(msg({ fromAddress: "talent@mail.dashlane.com", subject: "Your application: Software Engineer - Security Features" }), apps)
  assert.equal(match?.applicationId, "dash-swe")
  assert.ok(match!.confidence >= 0.9)
})

test("hiring systems count only when they name the company", () => {
  assert.equal(matchMessage(msg({ fromAddress: "no-reply@greenhouse.io", subject: "Thank you for applying to Dashlane" }), apps)?.applicationId, "dash-staff")
  assert.equal(matchMessage(msg({ fromAddress: "no-reply@greenhouse.io", subject: "Thank you for applying" }), apps), null)
})

test("names match as whole words only, and unrelated mail is ignored", () => {
  assert.equal(mentions("Pineapple newsletter", "Apple"), false)
  assert.equal(mentions("Update from Apple Inc.", "Apple"), true)
  assert.equal(matchMessage(msg({ fromAddress: "news@shop.com", subject: "Pineapple deals" }), apps), null)
  assert.equal(baseDomain("jobs.example.co.uk"), "example.co.uk")
})

test("providers are detected from the address", () => {
  assert.equal(providerFor("me@gmail.com").id, "gmail")
  assert.equal(providerFor("me@company.io").id, "other")
})
