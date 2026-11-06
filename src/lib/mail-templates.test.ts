import assert from "node:assert/strict"
import test from "node:test"
import { composeDraft, parseAddresses } from "./mail-templates"

const input = { name: "Alex Morgan", title: "Cloud Security Engineer", company: "Acme" }

test("drafts follow the application's language and fall back to English", () => {
  assert.match(composeDraft("apply", "fr", input).subject, /^Candidature : Cloud Security Engineer/)
  assert.match(composeDraft("apply", "it", input).body, /Please find attached/)
  assert.match(composeDraft("apply", "en", input).body, /Alex Morgan$/)
})

test("replies keep the thread subject and don't stack prefixes", () => {
  assert.equal(composeDraft("follow_up", "en", { ...input, subject: "Your application" }).subject, "Re: Your application")
  assert.equal(composeDraft("reply", "en", { ...input, subject: "RE: Your application" }).subject, "RE: Your application")
})

test("addresses are parsed and invalid ones dropped", () => {
  assert.deepEqual(parseAddresses("Talent <talent@acme.com>, bob@acme.io; not-an-email"), ["talent@acme.com", "bob@acme.io"])
})
