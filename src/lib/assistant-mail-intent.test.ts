import assert from "node:assert/strict"
import test from "node:test"
import { isEmailDraftRequest } from "./assistant-mail-intent"

test("email replies cannot route to a cover-letter tool", () => {
  for (const request of ["lets draft a response mail say next lundi im available", "i meant the email to respond to brisk", "write an email reply, not a cover letter", "rédiger un courriel de réponse", "Draft a response to the recruiter", "write a reply saying I am available Monday"]) assert.equal(isEmailDraftRequest(request), true, request)
})

test("explicit cover-letter requests keep their document tool", () => {
  for (const request of ["Draft the cover letter", "Write a lettre de motivation", "Prepare a cover letter for my email application", "Summarize my application"]) assert.equal(isEmailDraftRequest(request), false, request)
})
