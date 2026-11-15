import assert from "node:assert/strict"
import { test } from "node:test"
import { readLanguageLevel, splitLanguageItem } from "./language-level"

test("language level: read from the CV's wording in several languages", () => {
  const cases: [string, string | undefined][] = [
    ["native", "native"], ["langue maternelle", "native"], ["Muttersprache", "native"], ["nativo", "native"], ["اللغة الأم", "native"], ["bilingue", "native"],
    ["C1", "C1"], ["courant", "C1"], ["verhandlungssicher", "C1"], ["Fluent", "C1"], ["full professional proficiency", "C1"],
    ["professional working proficiency", "B2"], ["bon niveau", "B2"], ["conversational", "B1"], ["intermédiaire", "B1"], ["limited working proficiency", "B1"],
    ["notions", "A2"], ["Grundkenntnisse", "A2"], ["Basic", "A2"], ["scolaire", "A2"], ["débutant", "A1"],
  ]
  for (const [text, level] of cases) assert.equal(readLanguageLevel(text).level, level, text)
})

test("language level: nothing stated means no level, and a test is kept with its score", () => {
  assert.deepEqual(readLanguageLevel(""), {})
  assert.deepEqual(readLanguageLevel("since childhood"), {})
  assert.deepEqual(readLanguageLevel("courant (TOEIC 945)"), { level: "C1", test: "TOEIC 945" })
  assert.deepEqual(readLanguageLevel("C1 (Goethe-Zertifikat C1)"), { level: "C1", test: "Goethe-Zertifikat C1" })
  assert.deepEqual(readLanguageLevel("IELTS 7.5"), { test: "IELTS 7.5" })
})

test("language item: the name and what the CV says about it", () => {
  assert.deepEqual(splitLanguageItem("Anglais — courant (TOEIC 945)"), { name: "Anglais", rest: "courant (TOEIC 945" })
  assert.deepEqual(splitLanguageItem("French (B2)"), { name: "French", rest: "B2" })
  assert.deepEqual(splitLanguageItem("Deutsch   Muttersprache"), { name: "Deutsch", rest: "Muttersprache" })
  assert.deepEqual(splitLanguageItem("Portuguese"), { name: "Portuguese", rest: "" })
})
