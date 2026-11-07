import { test } from "node:test"
import assert from "node:assert/strict"
import { median, parseSalary } from "./salary"

test("French range with k and brut annuel", () => {
  const range = parseSalary("45-55k€ brut annuel")
  assert.deepEqual([range?.yearlyMin, range?.yearlyMax, range?.currency, range?.period], [45000, 55000, "EUR", "year"])
})

test("spaced thousands", () => {
  const range = parseSalary("45 000 € - 52 000 € par an")
  assert.equal(range?.yearlyMin, 45000)
  assert.equal(range?.yearlyMax, 52000)
})

test("US dollars with commas", () => {
  const range = parseSalary("$120,000 – $150,000 per year")
  assert.deepEqual([range?.yearlyMin, range?.yearlyMax, range?.currency], [120000, 150000, "USD"])
})

test("hourly pay becomes yearly", () => {
  const range = parseSalary("£30 an hour")
  assert.equal(range?.period, "hour")
  assert.equal(range?.currency, "GBP")
  assert.equal(range?.yearlyMin, 30 * 1607)
})

test("monthly French pay", () => {
  const range = parseSalary("3 500 € brut / mois")
  assert.equal(range?.period, "month")
  assert.equal(range?.yearlyMin, 42000)
})

test("day rate", () => {
  assert.equal(parseSalary("TJM 550€")?.period, "day")
})

test("no numbers or nonsense", () => {
  assert.equal(parseSalary("Competitive"), null)
  assert.equal(parseSalary("Selon profil"), null)
  assert.equal(parseSalary(""), null)
})

test("median", () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 3)
  assert.equal(median([]), null)
})
