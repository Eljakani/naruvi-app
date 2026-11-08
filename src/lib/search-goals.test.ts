import assert from "node:assert/strict"
import { test } from "node:test"
import { within } from "./geo"
import { goalFit, monthsOf, searchGoal } from "./search-goals"

const pfe = searchGoal.parse({ id: "pfe", name: "PFE Paris", contracts: ["internship"], places: ["Paris"], workModes: ["onsite", "hybrid"], authorizedIn: ["fr"], minMonths: 5, maxMonths: 6 })
const job = (over: object) => ({ location: "Paris, France", remote: "", employmentType: "", insights: { contract: "internship", workMode: "hybrid", programme: { duration: "6 mois", start: "", rhythm: "" }, visaSponsorship: null }, ...over })

test("places resolve cities, suburbs and countries", () => {
  assert.equal(within("Casablanca Metropolitan Area", "Paris"), false)
  assert.equal(within("La Défense, Île-de-France", "Paris"), true)
  assert.equal(within("Lyon", "France"), true)
  assert.equal(within("Lyon, France", "Paris"), false)
  assert.equal(within("Somewhere", "Paris"), null)
  assert.equal(within("Paris, Île-de-France, France", "Paris, France"), true)
  assert.equal(within("Casablanca", "Paris, France"), false)
})

test("durations read in months", () => {
  assert.deepEqual(monthsOf("4 à 6 mois"), [4, 6])
  assert.deepEqual(monthsOf("2 ans"), [24, 24])
  assert.equal(monthsOf("long"), null)
})

test("a matching job passes", () => {
  assert.equal(goalFit([pfe], job({}))?.verdict, "ok")
})

test("Casablanca on-site internship is blocked for a Paris goal", () => {
  const fit = goalFit([pfe], job({ location: "Casablanca Metropolitan Area", insights: { contract: "internship", workMode: "onsite", programme: { duration: "4 à 6 mois", start: "", rhythm: "" }, visaSponsorship: null } }))!
  assert.equal(fit.verdict, "blocked")
  assert.ok(fit.checks.some((item) => item.kind === "place" && item.status === "blocked"))
  assert.ok(fit.checks.some((item) => item.kind === "authorization" && item.status === "check"))
})

test("remote abroad needs a look when remote is accepted", () => {
  const remote = { ...pfe, workModes: [] }
  const fit = goalFit([remote], job({ location: "Casablanca", insights: { contract: "internship", workMode: "remote" } }))!
  assert.equal(fit.checks.find((item) => item.kind === "place")?.status, "check")
})

test("wrong contract and duration are blocked; best goal wins", () => {
  assert.equal(goalFit([pfe], job({ insights: { contract: "permanent", workMode: "onsite" } }))?.verdict, "blocked")
  assert.equal(goalFit([pfe], job({ insights: { contract: "internship", workMode: "onsite", programme: { duration: "2 mois", start: "", rhythm: "" } } }))?.verdict, "blocked")
  const cdi = searchGoal.parse({ id: "cdi", name: "CDI", contracts: ["permanent"], places: ["France"] })
  assert.equal(goalFit([pfe, cdi], job({ location: "Lyon", insights: { contract: "permanent", workMode: "onsite" } }))?.goal.id, "cdi")
})

test("without goals, the profile location only flags", () => {
  const fit = goalFit([], job({ location: "Casablanca" }), "Paris")!
  assert.equal(fit.implicit, true)
  assert.equal(fit.verdict, "check")
  assert.equal(goalFit([], job({}), ""), null)
})
