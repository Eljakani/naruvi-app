import assert from "node:assert/strict"
import test from "node:test"
import { guessCompany, normalizeWebsite } from "../company-input"

test("a LinkedIn company link gives the name, never a website", () => {
  assert.deepEqual(guessCompany("https://www.linkedin.com/company/dashlane/about/"), { name: "Dashlane", website: "", linkedinUrl: "https://www.linkedin.com/company/dashlane" })
  assert.equal(guessCompany("linkedin.com/company/global-experts-consulting").name, "Global Experts Consulting")
})

test("a website gives the domain and a name", () => {
  assert.deepEqual(guessCompany("https://www.dashlane.com/fr/careers"), { name: "Dashlane", website: "https://dashlane.com", linkedinUrl: "" })
  assert.equal(guessCompany("doctolib.fr").website, "https://doctolib.fr")
})

test("plain text is a name", () => {
  assert.deepEqual(guessCompany("Mobilize Financial Services"), { name: "Mobilize Financial Services", website: "", linkedinUrl: "" })
})

test("LinkedIn and job boards are not company websites", () => {
  assert.equal(normalizeWebsite("https://www.linkedin.com/company/dashlane"), "")
  assert.equal(normalizeWebsite("welcometothejungle.com/fr/companies/x"), "")
  assert.equal(normalizeWebsite("not a site"), "")
  assert.equal(normalizeWebsite("WWW.Dashlane.com/"), "https://dashlane.com")
})
