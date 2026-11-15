import assert from "node:assert/strict"
import { test } from "node:test"
import { eventEdition, genericSkillGroup, nameKey, nameVariants, skillKey } from "./enrichment"

test("enrichment: names are compared without legal forms, accents or punctuation", () => {
  assert.equal(nameKey("Robert Bosch GmbH"), nameKey("robert bosch"))
  assert.equal(nameKey("The Linux Foundation"), nameKey("Linux Foundation"))
  assert.equal(nameKey("Université Lumière Lyon 2"), "universitelumierelyon2")
  assert.notEqual(nameKey("Safran"), nameKey("Safran Electronics"))
})

test("enrichment: skill spellings meet, different things stay apart", () => {
  assert.equal(skillKey("Node.js"), skillKey("node js"))
  assert.equal(skillKey("ReactJS"), skillKey("React JS"))
  assert.notEqual(skillKey("C"), skillKey("C++"))
  assert.notEqual(skillKey("C"), skillKey("C#"))
})

test("enrichment: certification acronyms, event editions, unsorted skill lists", () => {
  assert.deepEqual(nameVariants("Certified Kubernetes Administrator (CKA)"), ["Certified Kubernetes Administrator (CKA)", "Certified Kubernetes Administrator", "CKA"])
  assert.deepEqual(eventEdition("PyData Berlin 2023"), { series: "PyData Berlin", year: "2023" })
  assert.deepEqual(eventEdition("FOSDEM"), { series: "FOSDEM", year: null })
  assert.equal(genericSkillGroup("Compétences"), true)
  assert.equal(genericSkillGroup("LinkedIn skills (2)"), true)
  assert.equal(genericSkillGroup("Gestion de projet"), false)
})
