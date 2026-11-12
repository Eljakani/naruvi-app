import assert from "node:assert/strict"
import { test } from "node:test"
import { cleanFields, entryView, fromLegacy } from "./entry-fields"

test("a project is named by its name and tagline, never a role", () => {
  const view = entryView({ kind: "project", display: { fr: { tagline: "Application de budget" } }, fields: { name: "Pocket Planner", context: "open_source", dates: { start: "2026" } } }, "fr")
  assert.deepEqual([view.heading, view.subheading, view.dates, view.details], ["Pocket Planner", "Application de budget", "2026", ["Open source"]])
})

test("an experience shows its position, company and contract in the CV language", () => {
  const entry = { kind: "experience", display: { fr: { position: "Infirmière" } }, fields: { company: "City Hospital", employment: "internship", dates: { start: "2025-02", end: "present" } } }
  assert.deepEqual([entryView(entry, "fr").heading, entryView(entry, "fr").subheading, entryView(entry, "fr").dates, entryView(entry, "fr").details], ["Infirmière", "City Hospital", "févr. 2025 – aujourd’hui", ["Stage"]])
  assert.equal(entryView(entry, "en").details[0], "Internship")
})

test("fields from another kind or with bad values are refused", () => {
  assert.deepEqual(cleanFields("project", { name: "Pocket Planner", company: "Northwind" }), { name: "Pocket Planner" })
  assert.throws(() => cleanFields("language", { level: "fluent-ish" }))
  assert.throws(() => cleanFields("certification", { issued: "April" }))
})

test("legacy role/organization/dates become a kind's own fields", () => {
  const job = fromLegacy("experience", "", { fr: { role: "Graphiste -- Freelance", organization: "Studio Nord", dates: "Mars 2023 - Janvier 2025", location: "Lyon" } })
  assert.deepEqual(job, { display: { fr: { position: "Graphiste", location: "Lyon" } }, fields: { company: "Studio Nord", employment: "freelance", dates: { start: "2023-03", end: "2025-01" } } })
  const project = fromLegacy("project", "Pocket Planner — Budget app for students", { fr: { role: "Lead developer", dates: "2024" } })
  assert.deepEqual(project, { display: { fr: { tagline: "Budget app for students" } }, fields: { name: "Pocket Planner", dates: { start: "2024" } } })
  const cert = fromLegacy("certification", "Example Institute — First Aid Certificate", { fr: { role: "First Aid Certificate", organization: "Example Institute", dates: "avril 2026" } })
  assert.deepEqual(cert.fields, { name: "First Aid Certificate", issuer: "Example Institute", issued: "2026-04" })
})
