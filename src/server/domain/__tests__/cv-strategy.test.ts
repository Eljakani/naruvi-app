import assert from "node:assert/strict"
import { test } from "node:test"
import type { ComposeAnalysis } from "../../documents/compose"
import type { CvDocument } from "../../documents/model"
import { gapsFrom, guidanceFor, planCv } from "../../documents/strategy"

const doc = {
  version: 1, language: "en", template: "classic", accent: "#2563eb", missingTranslations: [],
  header: { name: "A", headline: "Cloud engineer", summary: "", email: "", phone: "", location: "", links: [], photoPath: null, showPhoto: false },
  sections: [
    { id: "exp", kind: "experience", title: "Experience", included: true, groups: [], items: [
      { entryId: "e1", title: "Engineer", organization: "Northwind", dates: "2021–2024", included: true, bullets: [{ id: "b1", text: "Built Go automation on OCI for 40 services", factIds: ["f1"], included: true }] },
      { entryId: "e2", title: "Support analyst", organization: "Contoso", dates: "2018–2021", included: true, bullets: [{ id: "b2", text: "Answered customer tickets", factIds: ["f2"], included: true }] },
    ] },
    { id: "sk", kind: "skills", title: "Skills", included: true, items: [], groups: [{ label: "Tools", values: ["Go", "OCI"] }] },
  ],
} as unknown as CvDocument

const analysis = { requirements: [
  { kind: "must", status: "gap", text: "Kubernetes in production", keywords: [], factIds: [] },
  { kind: "must", status: "met", text: "Go", keywords: [], factIds: ["f1"] },
  { kind: "nice", status: "gap", text: "Rust", keywords: [], factIds: [] },
] } as unknown as ComposeAnalysis
const job = { title: "Platform Engineer", company: "Fabrikam", description: "Go and Kubernetes." }
const reply = (value: unknown) => async () => ({ text: JSON.stringify(value), model: "fake", inputTokens: 1, outputTokens: 1 })

test("gaps are the unproven must-haves, straight from the fit analysis", () => {
  assert.deepEqual(gapsFrom(analysis), ["Kubernetes in production"])
  assert.deepEqual(gapsFrom(null), [])
})

test("plan: keeps grounded selling points and lead entries, mapped to real entry ids", async () => {
  const plan = await planCv(doc, analysis, job, undefined, "English", reply({
    angle: "Platform Engineer with Go automation on OCI",
    strengths: [{ text: "Built Go automation on OCI", entries: ["E1"] }],
    lead: ["E1", "E9", "E1"],
  }))
  assert.equal(plan.strategy.angle, "Platform Engineer with Go automation on OCI")
  assert.deepEqual(plan.strategy.strengths, [{ text: "Built Go automation on OCI", entryIds: ["e1"] }])
  assert.deepEqual(plan.lead, ["e1"])
  assert.deepEqual(plan.strategy.gaps, ["Kubernetes in production"])
})

test("plan: drops claims the evidence does not hold", async () => {
  const plan = await planCv(doc, analysis, job, undefined, "English", reply({
    angle: "Kubernetes platform engineer",
    strengths: [
      { text: "Ran Kubernetes in production", entries: ["E1"] },
      { text: "Built Go automation for 400 services", entries: ["E1"] },
      { text: "Built Go automation on OCI", entries: [] },
    ],
    lead: [],
  }))
  assert.equal(plan.strategy.angle, "", "a skill from the posting is not the candidate's")
  assert.deepEqual(plan.strategy.strengths, [], "new skill, new number and uncited points are all rejected")
})

test("guidance carries the plan and the brief, and is absent when there is neither", () => {
  assert.equal(guidanceFor(null, undefined), undefined)
  assert.equal(guidanceFor(null, { pages: "auto", tone: "balanced", focus: "" }), undefined)
  const guidance = guidanceFor({ strategy: { angle: "A", strengths: [{ text: "S", entryIds: [] }], gaps: [] }, lead: [] }, { pages: "1", tone: "concise", focus: "team lead work" })
  assert.equal(guidance?.positioning, "A")
  assert.deepEqual(guidance?.sellingPoints, ["S"])
  assert.equal(guidance?.candidateEmphasis, "team lead work")
  assert.match(guidance?.detail ?? "", /short/)
})

test("plan: a selling point cannot lean on a skill the gaps list as unproven", async () => {
  const withSkill = structuredClone(doc)
  withSkill.sections[1].groups[0].values.push("Kubernetes")
  const plan = await planCv(withSkill, analysis, job, undefined, "English", reply({
    angle: "",
    strengths: [{ text: "Go and Kubernetes skills", entries: ["E1"] }, { text: "Built Go automation on OCI", entries: ["E1"] }],
    lead: [],
  }))
  assert.deepEqual(plan.strategy.strengths.map((item) => item.text), ["Built Go automation on OCI"])
})

test("plan: a skill named in a gap can still be sold when the cited entry shows it", async () => {
  const gapOnOci = { requirements: [{ kind: "must", status: "gap", text: "OCI architect certification", keywords: [], factIds: [] }] } as unknown as ComposeAnalysis
  const plan = await planCv(doc, gapOnOci, job, undefined, "English", reply({ angle: "", strengths: [{ text: "Built Go automation on OCI", entries: ["E1"] }, { text: "Go and OCI skills", entries: ["E2"] }], lead: [] }))
  assert.deepEqual(plan.strategy.strengths.map((item) => item.text), ["Built Go automation on OCI"])
})
