import assert from "node:assert/strict"
import { test } from "node:test"
import { experienceMonths, levelCheck } from "./experience"

const today = new Date("2026-06-15T12:00:00Z")

test("overlapping jobs count once and open ranges run to today", () => {
  assert.equal(experienceMonths([{ start: "2024-01", end: "2024-12" }, { start: "2024-07", end: "2025-06" }], today), 18)
  assert.equal(experienceMonths([{ start: "2026-01", end: "present" }], today), 6)
  assert.equal(experienceMonths([{ start: "2023", end: "2024" }], today), 13)
  assert.equal(experienceMonths([{ end: "2024-01" }, { start: "soon" }], today), 0)
})

test("a range in the future does not count", () => {
  assert.equal(experienceMonths([{ start: "2027-01", end: "2027-06" }], today), 0)
})

test("level check compares with the stated years, else the usual years of the level", () => {
  assert.deepEqual(levelCheck({ seniority: "senior", yearsRequired: null }, 24), { status: "reach", seniority: "senior", yearsAsked: 5, stated: false, yearsShown: 2 })
  assert.equal(levelCheck({ seniority: "senior", yearsRequired: 3 }, 24)?.status, "stretch")
  assert.equal(levelCheck({ seniority: "mid", yearsRequired: null }, 30)?.status, "ok")
})

test("entry-level and unlabelled jobs have nothing to compare", () => {
  assert.equal(levelCheck({ seniority: "junior", yearsRequired: 2 }, 0), null)
  assert.equal(levelCheck({ seniority: "unspecified", yearsRequired: null }, 0), null)
  assert.equal(levelCheck({ seniority: "unspecified", yearsRequired: 4 }, 12)?.status, "reach")
})
