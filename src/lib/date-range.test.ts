import { test } from "node:test"
import assert from "node:assert/strict"
import { durationMonths, formatDateRange, formatDuration, parseDateRange, rangeError } from "./date-range"

test("reads the English CV style", () => {
  assert.deepEqual(parseDateRange("Mar. 2023 - Jan. 2025"), { start: { year: 2023, month: 2 }, end: { year: 2025, month: 0 } })
})

test("reads French with present", () => {
  assert.deepEqual(parseDateRange("Février 2024 – aujourd’hui"), { start: { year: 2024, month: 1 }, end: "present" })
})

test("reads years only and numeric months", () => {
  assert.deepEqual(parseDateRange("2019 – 2021"), { start: { year: 2019, month: null }, end: { year: 2021, month: null } })
  assert.deepEqual(parseDateRange("2019-2021"), { start: { year: 2019, month: null }, end: { year: 2021, month: null } })
  assert.deepEqual(parseDateRange("03/2023 - present"), { start: { year: 2023, month: 2 }, end: "present" })
})

test("a single date", () => {
  assert.deepEqual(parseDateRange("June 2022"), { start: { year: 2022, month: 5 }, end: null })
})

test("text it can't read", () => {
  assert.equal(parseDateRange("Summer school"), null)
  assert.deepEqual(parseDateRange(""), { start: null, end: null })
})

test("writes both languages", () => {
  const range = parseDateRange("Mar. 2023 - Jan. 2025")!
  assert.equal(formatDateRange(range, "en"), "Mar. 2023 – Jan. 2025")
  assert.equal(formatDateRange(range, "fr"), "mars 2023 – janv. 2025")
  assert.equal(formatDateRange({ start: { year: 2024, month: 1 }, end: "present" }, "fr"), "févr. 2024 – aujourd’hui")
})

test("duration and order", () => {
  assert.equal(durationMonths({ start: { year: 2023, month: 2 }, end: { year: 2025, month: 0 } }), 23)
  assert.equal(formatDuration(23, "en"), "1 yr 11 mos")
  assert.equal(formatDuration(14, "fr"), "1 an 2 mois")
  assert.equal(rangeError({ start: { year: 2025, month: 0 }, end: { year: 2023, month: 0 } }), "The end is before the start.")
})
