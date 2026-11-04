import assert from "node:assert/strict"
import test from "node:test"
import { extractFromText } from "../../jobs/text-extract"

const pick = (text: string) => {
  const { role, company, location, remote } = extractFromText(text)
  return { role, company, location, remote }
}

test("EN hiring sentence", () => {
  assert.deepEqual(pick("Acme Security is hiring a Cloud Security Engineer in Lyon (hybrid).\n\nABOUT US\nWe protect critical infrastructure."), {
    role: "Cloud Security Engineer",
    company: "Acme Security",
    location: "Lyon",
    remote: "Hybrid",
  })
})

test("FR phrase de recrutement + localisation", () => {
  assert.deepEqual(pick("Thales recrute un Ingénieur DevSecOps H/F pour son site de Vélizy.\nPoste basé à Vélizy-Villacoublay, télétravail partiel possible."), {
    role: "Ingénieur DevSecOps H/F",
    company: "Thales",
    location: "Vélizy-Villacoublay",
    remote: "Remote",
  })
})

test("LinkedIn copy: role, then Company · Location", () => {
  assert.deepEqual(pick("Staff Product Security Engineer\nDashlane · Paris, Île-de-France, France (Hybrid)\n3 days ago · 120 applicants\n\nAbout the job\nDashlane's mission is…"), {
    role: "Staff Product Security Engineer",
    company: "Dashlane",
    location: "Paris, Île-de-France, France",
    remote: "Hybrid",
  })
})

test("labelled fields win", () => {
  assert.deepEqual(pick("Poste : Analyste SOC N2\nEntreprise : Orange Cyberdefense\nLocalisation : Rennes\n\nMissions\n- Investiguer les alertes"), {
    role: "Analyste SOC N2",
    company: "Orange Cyberdefense",
    location: "Rennes",
    remote: "",
  })
})

test("title lines: 'Role at Company' and 'Company | Role'", () => {
  assert.equal(pick("Senior Backend Engineer at Doctolib\nWe build…").company, "Doctolib")
  assert.deepEqual(pick("Mistral AI | Security Engineer\n\nYou will…").role, "Security Engineer")
  assert.equal(pick("Mistral AI | Security Engineer\n\nYou will…").company, "Mistral AI")
})

test("join sentence and 'About X' heading", () => {
  assert.deepEqual(pick("Join Datadog as a Site Reliability Engineer and help us scale.").role, "Site Reliability Engineer")
  assert.equal(pick("We're looking for a Detection Engineer.\n\nAbout Sekoia\nSekoia builds a SOC platform.").company, "Sekoia")
  assert.equal(pick("We're looking for a Detection Engineer.\n\nAbout Sekoia\nSekoia builds a SOC platform.").role, "Detection Engineer")
})

test("never invents: no evidence means empty fields", () => {
  assert.deepEqual(pick("Great opportunity!\nWe value curiosity and teamwork.\nApply today."), { role: "", company: "", location: "", remote: "" })
  // "We are hiring" is not a company, and a sentence without a role word is not a role.
  assert.deepEqual(pick("We are hiring fast and growing.\nOur team is amazing.").role, "")
  assert.equal(pick("About us\nWe build things.").company, "")
})

test("employment type needs explicit vocabulary", async () => {
  const { parseJobDocument } = await import("../../jobs/vendor/job-parser.js")
  const type = (text: string) => (parseJobDocument({ text }) as { employmentType: string }).employmentType
  assert.equal(type("Our mission is to secure every business. We have a contract with customers."), "")
  assert.equal(type("CDI, temps plein, Paris"), "Full-time")
  assert.equal(type("CDD de 12 mois"), "Fixed-term")
  assert.equal(type("Freelance mission, 6 months"), "Contract")
})
