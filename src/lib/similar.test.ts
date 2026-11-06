import assert from "node:assert/strict"
import test from "node:test"
import { cleanTags, SAME_ROLE, titleSimilarity, titleWords } from "./similar"

test("titles ignore gender markers, accents and contract tags", () => {
  assert.deepEqual(titleWords("Ingénieur DevSecOps Senior (CDI) - H/F"), ["ingenieur", "devsecops", "senior"])
  assert.ok(titleSimilarity("Cloud Security Engineer F/H", "Cloud Security Engineer (m/w/d)") >= SAME_ROLE)
  assert.ok(titleSimilarity("Ingénieur DevSecOps", "Ingenieur DevSecOps Senior") >= SAME_ROLE)
})

test("different roles at the same company are not duplicates", () => {
  assert.ok(titleSimilarity("Staff Product Security Engineer", "Software Engineer - Security Features") < SAME_ROLE)
  assert.ok(titleSimilarity("Data Analyst", "Account Executive") === 0)
})

test("tags are trimmed, deduplicated and capped", () => {
  assert.deepEqual(cleanTags(["  Paris  cloud ", "paris cloud", "", "Plan B"]), ["Paris cloud", "Plan B"])
  assert.equal(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 12)
})
