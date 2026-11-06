import assert from "node:assert/strict"
import test from "node:test"
import { baseDomain, matchMessage, mentions, replyAddress, replyTag, tagIn, type MatchCandidate } from "./mail-match"
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

test("per-application reply addresses match with certainty", () => {
  const id = "62d491e8-11c8-47dc-9bcd-9edc5dd2ec6c"
  assert.equal(replyTag(id), "nrv-62d491e811")
  assert.equal(replyAddress(id, "me+old@gmail.com", { mode: "plus" }), "me+nrv-62d491e811@gmail.com")
  assert.equal(replyAddress(id, "me@gmail.com", { mode: "domain", domain: "jobs.example.org" }), "nrv-62d491e811@jobs.example.org")
  assert.equal(replyAddress(id, "me@gmail.com", { mode: "off" }), null)
  assert.equal(tagIn("Me+NRV-62D491E811@gmail.com"), "nrv-62d491e811")
  const candidates = [{ ...apps[2], applicationId: id }]
  const match = matchMessage(msg({ fromAddress: "someone@gmail.com", toAddresses: ["me+nrv-62d491e811@gmail.com"] }), candidates)
  assert.equal(match?.applicationId, id)
  assert.equal(match?.confidence, 1)
})
