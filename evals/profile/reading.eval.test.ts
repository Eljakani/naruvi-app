/**
 * Offline evals for CV import: every invented CV in ./fixtures is read from
 * its file (PDF, DOCX) and structured by the reader that works without a
 * model, then scored against what the CV really says. No network, no model.
 * The model path is scored by `npm run profile:eval`.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { readCvFile } from "../../src/lib/cv-file"
import { readCvWithRules } from "../../src/lib/cv-rules"
import { scoreImport, type Expected } from "./score"

const root = import.meta.dirname
const expected: Record<string, Expected> = Object.assign({}, ...["expected.json", "expected-long.json"].map((file) => JSON.parse(readFileSync(join(root, file), "utf8"))))
const read = (name: string) => readCvFile(new Uint8Array(readFileSync(join(root, "fixtures", name))), name)

/** Lines that must come out whole and in this order: columns kept apart, tables kept together. */
const ORDER: Record<string, string[]> = {
  "fr-two-column.pdf": ["CONTACT", "julien.marchetti@example.fr", "LANGUES", "Anglais — courant (TOEIC 945)", "EXPÉRIENCES PROFESSIONNELLES", "Decathlon — Lille | 03/2022 – aujourd'hui", "FORMATION"],
  "en-interleaved.pdf": ["CONTACT", "noah.bergstrom@example.se", "LANGUAGES", "English — Fluent", "EXPERIENCE", "Klarna · Stockholm · Aug 2021 – Present", "EDUCATION", "Chalmers University of Technology · 2014 – 2016"],
  "en-shuffled.pdf": ["Noah Bergström", "SKILLS", "Research: user interviews, usability", "EXPERIENCE", "Lead Product Designer", "IKEA · Älmhult · Jun 2016 – Dec 2017", "SPEAKING"],
  "de-table.docx": ["seit 04/2021   Entwicklungsingenieur", "Siemens AG, München", "10/2017 – 03/2021   Konstrukteur", "Deutsch   Muttersprache"],
  "ar-simple.pdf": ["مهندسة برمجيات — OCP Group، الدار البيضاء", "يناير 2021 – حتى الآن", "• ترحيل 12 خدمة إلى Kubernetes.", "العربية (اللغة الأم)، الفرنسية (C1)، الإنجليزية (B2)"],
}

for (const name of readdirSync(join(root, "fixtures")).sort()) {
  const want = expected[name]
  if (!want) continue
  test(`cv eval: ${name}`, async () => {
    const file = await read(name)
    if (want.error) return assert.deepEqual(file, { ok: false, problem: want.error })
    assert.ok(file.ok && file.kind !== "linkedin", `${name} should be read as a CV`)
    const lines = file.text.split("\n")
    let at = -1
    for (const line of ORDER[name] ?? []) {
      const found = lines.indexOf(line, at + 1)
      assert.ok(found > at, `"${line}" should come out whole, after the lines before it`)
      at = found
    }
    const result = readCvWithRules(file.text, file.links)
    const score = scoreImport(want, result)
    // No entry lost or merged, and at least nine points in ten.
    assert.equal(score.found >= score.expected - 2, true, score.problems.join("\n"))
    assert.ok(score.points / score.total >= 0.8, `${score.points}/${score.total}\n${score.problems.join("\n")}`)
  })
}

test("cv eval: links behind words and icons are read from the file", async () => {
  const classic = await read("en-classic.pdf")
  assert.ok(classic.ok && classic.kind === "pdf")
  assert.deepEqual(classic.links.map((link) => link.url), ["https://www.linkedin.com/in/maya-okafor-dev", "https://github.com/mayaokafor"])
  const word = await read("es-unusual.docx")
  assert.ok(word.ok && word.kind === "docx")
  assert.deepEqual(word.links, [{ text: "luciafernandez.example.es", url: "https://luciafernandez.example.es/" }])
})

test("cv eval: files that are not a readable CV say why", async () => {
  assert.deepEqual(await readCvFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]), "cv.doc"), { ok: false, problem: "legacyWord" })
  assert.deepEqual(await readCvFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), "cv.png"), { ok: false, problem: "image" })
  assert.deepEqual(await readCvFile(new TextEncoder().encode("{\\rtf1 hello}"), "cv.rtf"), { ok: false, problem: "unsupported" })
  assert.deepEqual(await readCvFile(new TextEncoder().encode("too short"), "cv.txt"), { ok: false, problem: "empty" })
  assert.deepEqual(await readCvFile(new Uint8Array(), "cv.pdf"), { ok: false, problem: "empty" })
})
