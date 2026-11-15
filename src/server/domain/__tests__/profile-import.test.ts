import assert from "node:assert/strict"
import { test } from "node:test"
import { describeEntry, importProfileText, translateEntry, translateFacts } from "../../profile/ai-import"

const reply = (value: unknown) => async () => ({ text: JSON.stringify(value), model: "fake", inputTokens: 1, outputTokens: 1 })
const cv = "Night nurse at City Hospital (2021 – 2024). Trained 6 new nurses on a 40-bed ward. Skills: triage, DxCare. Volunteer work on weekends to fill this line out."

test("import: drops facts with numbers not in the CV and skills not mentioned", async () => {
  const result = await importProfileText(cv, reply({
    language: "en",
    identity: { fullName: "A B" },
    entries: [{ kind: "experience", text: { position: "Night nurse", role: "dropped: not an experience field" }, fields: { company: "City Hospital", dates: "2021 – 2024", employment: "made-up" },
      facts: ["Trained 6 new nurses", "Ran a 60-bed ward", "Worked night shifts"], skills: ["triage", "Kubernetes"],
      bullets: [{ text: "Trained 6 new nurses on a 40-bed ward", facts: [0] }, { text: "Ran a 60-bed ward", facts: [1] }] }],
  }))
  const entry = result.entries[0]
  assert.deepEqual(entry.facts, ["Trained 6 new nurses", "Worked night shifts"])
  assert.deepEqual(entry.skills, ["triage"])
  assert.equal(entry.bullets.length, 1)
  assert.equal(entry.dropped, 2)
  // Only the kind's own fields survive, in valid shapes; CV-style dates are read.
  assert.deepEqual(entry.text, { position: "Night nurse" })
  assert.deepEqual(entry.fields, { company: "City Hospital", dates: { start: "2021", end: "2024" } })
})

test("describe: skips facts already in the entry", async () => {
  const result = await describeEntry("I trained 6 new nurses and worked nights at City Hospital for three years.", { existingFacts: ["Trained 6 new nurses"] }, reply({
    language: "en", entry: { kind: "experience", text: {}, fields: { company: "City Hospital" }, facts: ["Trained 6 new nurses", "Worked night shifts"], skills: [] },
  }))
  assert.deepEqual(result.entry.facts, ["Worked night shifts"])
})

test("translate: a bullet whose numbers change is rejected", async () => {
  const result = await translateEntry({ from: "fr", to: "en", text: { position: "Infirmière" }, bullets: [{ id: "a", text: "Formation de 6 infirmières" }, { id: "b", text: "Service de 40 lits" }] }, reply({
    text: { position: "Nurse", extra: "ignored" }, bullets: [{ id: "a", text: "Trained 6 nurses" }, { id: "b", text: "A 400-bed unit" }],
  }))
  assert.deepEqual(result.bullets, [{ id: "a", text: "Trained 6 nurses" }])
  assert.deepEqual(result.text, { position: "Nurse" })
})

test("import: names put in the wrong slot are kept, lists are capped, language is normalized", async () => {
  const text = "Formation : Master Informatique, Université de Lyon (2019 - 2021). Projet Pocket Planner. Certification AWS Solutions Architect. Compétences : " + Array.from({ length: 50 }, (_, i) => `Outil${i}`).join(", ") + ". Node.js, ReactJS."
  const result = await importProfileText(text, reply({
    language: "FR",
    identity: {},
    entries: [
      // school and project/certification names given as per-language text, degree under a model-made key
      { kind: "education", text: { school: "Université de Lyon", diploma: "Master Informatique" }, fields: { period: "2019 - 2021" }, facts: [], skills: [] },
      { kind: "project", text: { name: "Pocket Planner" }, fields: {}, facts: ["Built Pocket Planner"], skills: [] },
      { kind: "certification", text: { title: "AWS Solutions Architect" }, fields: {}, facts: [], skills: ["AWS"] },
      { kind: "skill", text: {}, fields: {}, facts: [], skills: [...Array.from({ length: 50 }, (_, i) => `Outil${i}`), "node js", "React JS"] },
    ],
  }))
  assert.equal(result.language, "fr")
  const [education, project, certification, skills] = result.entries
  assert.deepEqual(education.text, { degree: "Master Informatique" })
  assert.deepEqual(education.fields, { school: "Université de Lyon", dates: { start: "2019", end: "2021" } })
  assert.equal(education.unnamed, undefined)
  assert.equal(project.fields.name, "Pocket Planner")
  assert.equal(certification.fields.name, "AWS Solutions Architect")
  // 52 skills, none rejected for the count; "node js" / "React JS" meet "Node.js" / "ReactJS".
  assert.equal(skills.skills.length, 52)
  assert.equal(skills.text.name, "Compétences")
})

test("import: an entry whose name can't be read is flagged, not dropped", async () => {
  const result = await importProfileText(cv, reply({ language: "en", identity: {}, entries: [{ kind: "experience", text: {}, fields: { company: "City Hospital" }, facts: ["Worked night shifts"], skills: [] }] }))
  assert.equal(result.entries.length, 1)
  assert.equal(result.entries[0].unnamed, true)
})

test("translate facts: keeps translations with the same numbers, per requested language", async () => {
  const result = await translateFacts({ languages: ["en", "fr"], facts: [{ id: "a", text: "Formation de 6 infirmières" }, { id: "b", text: "Service de 40 lits" }] }, reply({
    facts: [{ id: "a", translations: { en: "Trained 6 nurses", fr: "Formation de 6 infirmières", de: "ignored" } }, { id: "b", translations: { en: "A 400-bed unit" } }, { id: "zzz", translations: { en: "unknown" } }],
  }))
  assert.deepEqual(result.facts, [{ id: "a", translations: { en: "Trained 6 nurses", fr: "Formation de 6 infirmières" } }])
})

const source = `Ana Silva
Backend Engineer · Leeds
ana.silva@example.org · github.com/anasilva-dev

Summary
Engineer with seven years in payments.

Experience
Senior Engineer — Monzo, London
Mar 2021 – Present
• Mentored 5 engineers.
Intern — Arm, Cambridge
été 2017

Talks
"Ledgers at scale" — GopherCon UK 2022, London

Languages
English (native), French (B2), Yoruba (conversational), Welsh`

test("import: links, dates and levels come from the CV, never from the model's completion of it", async () => {
  const result = await importProfileText(source, reply({
    language: "en",
    identity: { fullName: "Ana Silva", headline: "Backend Engineer", summary: "Engineer with seven years in payments.", email: "ana@silva.example", links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/ana-silva" }, { label: "GitHub", url: "github.com/anasilva-dev" }] },
    entries: [
      { kind: "experience", text: { position: "Senior Engineer", location: "London" }, fields: { company: "Monzo", dates: { start: "2021-04", end: "present" } }, datesText: "Mar 2021 – Present", facts: ["Mentored 5 engineers."], skills: [], bullets: [] },
      // A season is not a month.
      { kind: "experience", text: { position: "Intern", location: "Cambridge" }, fields: { company: "Arm", dates: { start: "2017-06", end: "2017-08" } }, datesText: "été 2017", facts: [], skills: [], bullets: [] },
      { kind: "event", text: { title: "Ledgers at scale", location: "London" }, fields: { event: "GopherCon UK 2022", date: "2022", url: "https://gophercon.example/2022" }, facts: [], skills: [], bullets: [] },
      { kind: "language", text: { language: "English" }, fields: { level: "C2" }, levelText: "native" },
      { kind: "language", text: { language: "French" }, fields: {}, levelText: "" },
      { kind: "language", text: { language: "Yoruba" }, fields: { level: "B2" }, levelText: "conversational" },
      // The CV gives no level: the model's guess is dropped.
      { kind: "language", text: { language: "Welsh" }, fields: { level: "A2" }, levelText: "" },
    ],
  }), { links: [{ text: "LinkedIn", url: "https://www.linkedin.com/in/ana-silva-dev" }] })
  assert.equal(result.reader, "model")
  assert.equal(result.identity.email, "ana.silva@example.org")
  assert.equal(result.identity.summary, "Engineer with seven years in payments.")
  // The link behind the word "LinkedIn" replaces the address the model made up from the name.
  assert.deepEqual(result.identity.links, [{ label: "LinkedIn", url: "https://www.linkedin.com/in/ana-silva-dev" }, { label: "GitHub", url: "https://github.com/anasilva-dev" }])
  const [senior, intern, talk, english, french, yoruba, welsh] = result.entries
  assert.deepEqual(senior.fields.dates, { start: "2021-03", end: "present" })
  assert.deepEqual(intern.fields.dates, { start: "2017" })
  assert.equal(talk.kind, "event")
  assert.deepEqual(talk.fields, { event: "GopherCon UK 2022", date: "2022" })
  assert.deepEqual([english, french, yoruba, welsh].map((entry) => entry.fields.level), ["native", "B2", "B1", undefined])
  assert.deepEqual(result.unread, [])
})

test("import: a long CV is read in parts; a part the model fails on is reported, the rest is kept", async () => {
  const job = (n: number) => `Engineer ${n} — Company ${n}, City\n20${10 + n} – 20${11 + n}\n• ${"Shipped a feature used by many teams. ".repeat(30)}`
  const long = `Ana Silva\nana.silva@example.org\n\nExperience\n${Array.from({ length: 9 }, (_, n) => job(n)).join("\n\n")}\n\nEducation\nBSc Computer Science — University of Leeds, 2005 – 2008\n${"Coursework in systems. ".repeat(60)}`
  const calls: string[] = []
  const complete = async (input: { user: string; system: string }) => {
    const part = JSON.parse(input.user).text as string
    calls.push(part)
    if (part.includes("Coursework")) throw new Error("model timeout")
    const entries = [...part.matchAll(/Engineer (\d) — Company \d, City\n(20\d\d) – (20\d\d)/g)].map((match) => ({ kind: "experience", text: { position: `Engineer ${match[1]}`, location: "City" }, fields: { company: `Company ${match[1]}` }, datesText: `${match[2]} – ${match[3]}`, facts: [], skills: [], bullets: [] }))
    return { text: JSON.stringify({ language: "en", identity: part.startsWith("Ana") ? { fullName: "Ana Silva", email: "ana.silva@example.org" } : {}, entries }), model: "fake", inputTokens: 1, outputTokens: 1 }
  }
  const result = await importProfileText(long, complete)
  assert.ok(calls.length >= 3)
  assert.equal(result.identity.fullName, "Ana Silva")
  assert.deepEqual(result.entries.map((entry) => entry.text.position), Array.from({ length: 9 }, (_, n) => `Engineer ${n}`))
  assert.deepEqual(result.entries[3].fields.dates, { start: "2013", end: "2014" })
  assert.deepEqual(result.failedParts, ["Education"])
  assert.ok(result.unread.some((line) => line.startsWith("BSc Computer Science")))
})
