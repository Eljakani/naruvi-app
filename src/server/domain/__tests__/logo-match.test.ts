import assert from "node:assert/strict"
import test from "node:test"
import { matchLogo } from "../../profile/logo-match"

const files = [
  { file: "companies_logos/Oracle-logo.png", aspect: 4.2 },
  { file: "companies_logos/oracle.webp", aspect: 1 },
  { file: "companies_logos/Northwind-Traders-logo.png", aspect: 3 },
  { file: "companies_logos/Northwind-Traders-mark.png", aspect: 1 },
  { file: "companies_logos/contoso.png", aspect: 1 },
  { file: "schools_logos/logo-telecom-paris.png", aspect: 1.2 },
  { file: "schools_logos/logo-ensa.png", aspect: 1 },
]

test("prefers the square variant of the right company", () => {
  assert.equal(matchLogo("Oracle Research & Development", files), "companies_logos/oracle.webp")
  assert.equal(matchLogo("Northwind Traders", files), "companies_logos/Northwind-Traders-mark.png")
  assert.equal(matchLogo("CONTOSO", files), "companies_logos/contoso.png")
  assert.equal(matchLogo("Télécom Paris", files), "schools_logos/logo-telecom-paris.png")
})

test("never matches on a partial or unrelated name", () => {
  assert.equal(matchLogo("Paris Saclay", files), null)
  assert.equal(matchLogo("Acme", files), null)
})
