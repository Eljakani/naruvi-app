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

const brisk: MatchCandidate = { applicationId: "brisk", company: "Brisk", website: "https://brisk.io", title: "Core Software Engineer, full-stack", sentMessageIds: [], active: true, updatedAt: 1 }
const invitation = msg({ fromAddress: "someone@orange.fr", fromName: "Alex", subject: "Interview Invitation – Core Software Engineer (Full-Stack) at Briskk", text: "We've reviewed your application and would like to invite you for an interview. Best regards, Briskk Recruitment Team" })

test("Brisk/Briskk invitation combines a near company name, role and interview wording", () => {
  const match = matchMessage(invitation, [brisk])
  assert.equal(match?.applicationId, "brisk")
  assert.match(match!.reason, /Similar company name/)
  assert.match(match!.reason, /Matching role title/)
})

test("a personal sender can name the company only in the body or signature", () => {
  const match = matchMessage(msg({ fromAddress: "recruiter@orange.fr", subject: "Let's arrange an interview", text: "Thanks for your application. Best regards, Dashlane recruitment" }), apps)
  assert.equal(match?.applicationId, "dash-staff")
  assert.match(match!.reason, /email body/)
})

test("a company sender domain works even without a saved website", () => {
  const match = matchMessage(msg({ fromAddress: "recruiter@careers.brisk.io", subject: "Interview availability" }), [{ ...brisk, website: null }])
  assert.equal(match?.applicationId, "brisk")
  assert.match(match!.reason, /Sender domain names/)
})

test("a linked recruiter can use an agency or personal email", () => {
  const match = matchMessage(msg({ fromAddress: "RECRUITER@agency.com", subject: "Next steps" }), [{ ...brisk, contactEmails: ["recruiter@agency.com"] }])
  assert.equal(match?.applicationId, "brisk")
  assert.match(match!.reason, /linked recruiter/)
})

test("the role in the body disambiguates applications at one company", () => {
  const match = matchMessage(msg({ fromAddress: "talent@dashlane.com", subject: "Your interview", text: "This is about our Software Engineer - Security Features position." }), apps)
  assert.equal(match?.applicationId, "dash-swe")
})

test("fuzzy names alone, roles alone, short fuzzy names and unrelated body mentions do not match", () => {
  assert.equal(matchMessage({ ...invitation, subject: "Hello from Briskk", text: "Lunch tomorrow?" }, [brisk]), null)
  assert.equal(matchMessage({ ...invitation, subject: "Interview for Core Software Engineer, full-stack", text: "" }, [brisk]), null)
  assert.equal(matchMessage({ ...invitation, subject: "Interview for Core Software Engineer, full-stack at Acme", text: "" }, [{ ...brisk, company: "Acne" }]), null)
  assert.equal(matchMessage(msg({ subject: "Weekly news", text: "Apple released a phone." }), apps), null)
  assert.equal(matchMessage(msg({ subject: "Pineapple interview", text: "" }), [apps[2]]), null)
})

test("near-equal evidence across companies is left unlinked, rather than decided by recency", () => {
  assert.equal(matchMessage(invitation, [brisk, { ...brisk, applicationId: "brikk", company: "Brikk", updatedAt: 100 }]), null)
})

test("an exact company match wins over a similarly spelled company", () => {
  assert.equal(matchMessage(invitation, [brisk, { ...brisk, applicationId: "briskk", company: "Briskk" }])?.applicationId, "briskk")
})

test("references and tagged replies still win over conflicting text", () => {
  assert.equal(matchMessage({ ...invitation, references: ["<sent-1@naruvi>"] }, [...apps, brisk])?.applicationId, "dash-staff")
})

test("a free-mail domain cannot identify the company", () => {
  assert.equal(matchMessage(msg({ fromAddress: "recruiter@orange.fr", subject: "Interview availability" }), [{ ...brisk, company: "Orange", website: "https://orange.fr" }]), null)
})

test("company names with accents and legal suffixes remain recognizable", () => {
  assert.equal(matchMessage(msg({ subject: "Entretien chez Société Élan" }), [{ ...brisk, company: "Société Élan SAS" }])?.applicationId, "brisk")
})

test("a company website in the signature corroborates an interview and role without its trading name", () => {
  const message = msg({ subject: "Interview: Core Software Engineer, full-stack", text: "Please share your availability. https://jobs.brisk.io/careers" })
  const match = matchMessage(message, [{ ...brisk, company: "Mobility Partners" }])
  assert.equal(match?.applicationId, "brisk")
  assert.match(match!.reason, /Company domain brisk.io in the body/)
  assert.equal(matchMessage({ ...message, subject: "Weekly links", text: "https://jobs.brisk.io/careers" }, [{ ...brisk, company: "Mobility Partners" }]), null)
})

test("a known recruiter's display name needs both role and application context", () => {
  const candidate = { ...brisk, contactNames: ["Alex Martin"] }
  const message = msg({ fromName: "Alex Martin", subject: "Interview: Core Software Engineer, full-stack" })
  assert.equal(matchMessage(message, [candidate])?.applicationId, "brisk")
  assert.equal(matchMessage({ ...message, subject: "Dinner tomorrow?" }, [candidate]), null)
})
