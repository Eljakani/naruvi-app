import assert from "node:assert/strict"
import test from "node:test"
import { compareRangesDesc, parseDateRange } from "../dates"

test("parses EN/FR ranges, present and year-only", () => {
  assert.deepEqual(parseDateRange("Feb. 2025 - Aug. 2025"), { start: 202502, end: 202508, current: false })
  assert.deepEqual(parseDateRange("Mars 2026 – aujourd'hui"), { start: 202603, end: 999999, current: true })
  assert.deepEqual(parseDateRange("2019 - 2025"), { start: 201901, end: 202512, current: false })
  assert.deepEqual(parseDateRange("Since 2022"), { start: 202201, end: 999999, current: true })
  assert.deepEqual(parseDateRange("Juil. 2026 - Présent"), { start: 202607, end: 999999, current: true })
  assert.deepEqual(parseDateRange("April 2024"), { start: 202404, end: 202404, current: false })
  assert.deepEqual(parseDateRange("03/2021 - 11/2022"), { start: 202103, end: 202211, current: false })
  assert.deepEqual(parseDateRange("whenever"), { start: null, end: null, current: false })
})

test("sorts newest first, ongoing on top, unknown last", () => {
  const items = ["Mar. 2023 - Jan. 2025", "Mar. 2026 - Present", "", "Feb. 2025 - Aug. 2025", "Dec. 2024 - May 2026"]
  const sorted = [...items].sort((a, b) => compareRangesDesc(parseDateRange(a), parseDateRange(b)))
  assert.deepEqual(sorted, ["Mar. 2026 - Present", "Dec. 2024 - May 2026", "Feb. 2025 - Aug. 2025", "Mar. 2023 - Jan. 2025", ""])
})
