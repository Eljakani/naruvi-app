import assert from "node:assert/strict"
import test from "node:test"
import { ruleKind, suggestFor } from "./mail-classify"

const now = new Date(2026, 10, 6, 10).getTime()

test("rules recognise replies in several languages, strongest signal first", () => {
  assert.equal(ruleKind("Your application", "Unfortunately we have decided to move forward with other candidates."), "rejection")
  assert.equal(ruleKind("Votre candidature", "Malheureusement, nous ne pouvons pas donner suite à votre candidature."), "rejection")
  assert.equal(ruleKind("Next steps", "We'd love to schedule a call. Could you share your availability?"), "interview")
  assert.equal(ruleKind("Entretien", "Pourriez-vous nous indiquer vos disponibilités pour un entretien ?"), "interview")
  assert.equal(ruleKind("Bewerbung", "Vielen Dank für Ihre Bewerbung, sie ist eingegangen."), "acknowledgement")
  assert.equal(ruleKind("Offer", "Thank you for applying. We are pleased to extend an offer for the role."), "offer")
  assert.equal(ruleKind("Deals", "Big savings this week"), "other")
})

test("suggestions move forward only and never reopen a closed application", () => {
  assert.deepEqual(suggestFor("rejection", "submitted", "Acme", now), { status: "rejected", summary: "Acme declined. Mark it as rejected?" })
  assert.equal(suggestFor("rejection", "rejected", "Acme", now), null)
  const interview = suggestFor("interview", "submitted", "Acme", now)!
  assert.equal(interview.status, "interviewing")
  assert.equal(interview.nextStep, "Reply with your availability")
  assert.equal(suggestFor("interview", "offer", "Acme", now)?.status, undefined)
  assert.equal(suggestFor("acknowledgement", "ready", "Acme", now)?.status, "submitted")
  assert.equal(suggestFor("acknowledgement", "interviewing", "Acme", now), null)
  assert.equal(suggestFor("other", "submitted", "Acme", now), null)
})
