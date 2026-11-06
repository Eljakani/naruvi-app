import assert from "node:assert/strict"
import test from "node:test"
import { contractOf, programmeOf } from "./job-program"

test("the most specific contract type wins", () => {
  assert.equal(contractOf("Alternance de 24 mois, possibilité de CDI à l'issue"), "apprenticeship")
  assert.equal(contractOf("Stage de fin d'études de 6 mois"), "internship")
  assert.equal(contractOf("Werkstudent (m/w/d) – 20 Stunden pro Woche"), "student_job")
  assert.equal(contractOf("V.I.E à Singapour, 12 mois"), "volunteer")
  assert.equal(contractOf("Mission d'intérim de 3 mois"), "temporary")
  assert.equal(contractOf("Poste saisonnier pour l'été"), "seasonal")
  assert.equal(contractOf("Freelance, TJM 550€"), "freelance")
  assert.equal(contractOf("CDD de 6 mois"), "fixed_term")
  assert.equal(contractOf("CDI, statut cadre"), "permanent")
  assert.equal(contractOf("Interview stage of the process, then a permanent contract"), "permanent")
  assert.equal(contractOf("Great team, nice office"), "unspecified")
})

test("programme details are read as written", () => {
  const fr = programmeOf("Alternance de 24 mois à partir de septembre 2026, rythme 3 semaines en entreprise / 1 semaine à l'école.")
  assert.equal(fr.duration, "24 mois")
  assert.equal(fr.start, "septembre 2026")
  assert.match(fr.rhythm, /3 semaines en entreprise \/ 1 semaine à l'école/)
  const en = programmeOf("6-month internship starting January 2027.")
  assert.equal(en.start, "January 2027")
  assert.equal(programmeOf("A permanent role.").duration, "")
})
