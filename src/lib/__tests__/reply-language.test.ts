import assert from "node:assert/strict"
import test from "node:test"
import { replyLanguage } from "../reply-language"

test("detects the user's language from their own words", () => {
  assert.equal(replyLanguage("Which saved jobs fit me best?").code, "en")
  assert.equal(replyLanguage("Quelles sont mes candidatures en cours ?").code, "fr")
  assert.equal(replyLanguage("Peux-tu ajouter un contact pour Dashlane ?").code, "fr")
  assert.equal(replyLanguage("¿Qué empresas tengo en mi lista?").code, "es")
  assert.equal(replyLanguage("Kannst du bitte meine Bewerbung prüfen?").code, "de")
})

test("French job titles inside an English request stay English", () => {
  assert.equal(replyLanguage("Set a follow-up for the Ingénieur DevOps Cloud role at imagino next Monday").code, "en")
})

test("short or neutral messages default to English", () => {
  assert.equal(replyLanguage("ok").code, "en")
  assert.equal(replyLanguage("https://dashlane.com").code, "en")
  assert.equal(replyLanguage("").code, "en")
})

test("Arabic prompts use Arabic and ambiguous prompts use the app language", () => {
  assert.equal(replyLanguage("ما هي الوظائف التي تناسبني لدى Dashlane؟").code, "ar")
  assert.equal(replyLanguage("مرحبًا").code, "ar")
  assert.equal(replyLanguage("https://dashlane.com", "ar").code, "ar")
  assert.equal(replyLanguage("OK", "fr").code, "fr")
  assert.equal(replyLanguage("Which saved jobs fit me best?", "ar").code, "en")
})
