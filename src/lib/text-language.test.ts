import assert from "node:assert/strict"
import test from "node:test"
import { foreignLanguage, inLanguage } from "./text-language"

test("a French sentence is foreign to an English document, and the reverse", () => {
  assert.equal(foreignLanguage("Contribution à des tâches d'automatisation et de reporting en Python et Bash.", "en"), "fr")
  assert.equal(foreignLanguage("Built the booking service with Go and cut response time by 40% for the mobile team.", "fr"), "en")
  assert.equal(foreignLanguage("Ingénieur en sécurité des systèmes", "en"), "fr")
})

test("a line in the document's language is never foreign", () => {
  assert.equal(foreignLanguage("Built the booking service with Go and cut response time by 40%.", "en"), null)
  assert.equal(foreignLanguage("Mise en place de la chaîne CI/CD pour les équipes produit.", "fr"), null)
  assert.equal(foreignLanguage("Desarrollo de la plataforma de pagos con el equipo de producto.", "es"), null)
})

test("names, places and tool lists are not judged", () => {
  for (const text of ["Kubernetes, Docker, Terraform, CI/CD", "Lyon, Auvergne-Rhône-Alpes, France", "Site Reliability Engineer", "Val-de-Marne", "", "L'Atelier Numérique"]) {
    assert.equal(foreignLanguage(text, "en"), null, text)
    assert.equal(foreignLanguage(text, "fr"), null, text)
  }
})

test("job vocabulary borrowed from English does not make a French line foreign", () => {
  assert.ok(inLanguage("Mise en place de pipelines CI/CD with GitHub Actions and Docker pour l'équipe.", "fr"))
})

test("Arabic script in a Latin-script document is foreign; unknown document languages are not judged", () => {
  assert.equal(foreignLanguage("تطوير منصة الدفع مع فريق المنتج", "en"), "ar")
  assert.equal(foreignLanguage("Built the service with Go and the team.", "ar"), "en")
  assert.equal(foreignLanguage("Built the service with Go and the team.", "it"), null)
})
