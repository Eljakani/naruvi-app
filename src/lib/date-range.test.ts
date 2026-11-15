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

const ym = (text: string) => {
  const range = parseDateRange(text)
  if (!range) return null
  const point = (value: typeof range.start | "present") => (value === "present" ? "present" : value ? `${value.year}${value.month === null ? "" : `-${String(value.month + 1).padStart(2, "0")}`}` : "")
  return `${point(range.start)}..${point(range.end)}`
}

test("reads Spanish, German, Italian and Arabic months", () => {
  assert.equal(ym("enero de 2020 – actualidad"), "2020-01..present")
  assert.equal(ym("sept. 2016 – dic. 2019"), "2016-09..2019-12")
  assert.equal(ym("Okt. 2015 bis Dez. 2017"), "2015-10..2017-12")
  assert.equal(ym("maggio 2019 - oggi"), "2019-05..present")
  assert.equal(ym("يناير 2021 – حتى الآن"), "2021-01..present")
  assert.equal(ym("٢٠١٨ – ٢٠٢٠"), "2018..2020")
})

test("reads an open start, ISO months and a separator that lost its glyph", () => {
  assert.equal(ym("seit 04/2021"), "2021-04..present")
  assert.equal(ym("depuis septembre 2022"), "2022-09..present")
  assert.equal(ym("2017-10 → 2019-09"), "2017-10..2019-09")
  assert.equal(ym("2017-10 ’ 2019-09"), "2017-10..2019-09")
  assert.equal(ym("2021-01 → now"), "2021-01..present")
  assert.equal(ym("octobre 2023 à mai 2024"), "2023-10..2024-05")
  assert.equal(ym("15/03/2021 - 01/09/2022"), "2021-03..2022-09")
})

test("a season is a year, a school year is two years, three dates are not a range", () => {
  assert.equal(ym("été 2024"), "2024..")
  assert.equal(ym("2019-20"), "2019..2020")
  assert.equal(ym("2020 - 2021 - 2022"), null)
})
