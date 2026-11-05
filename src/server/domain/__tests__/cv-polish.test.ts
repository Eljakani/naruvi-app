import assert from "node:assert/strict"
import { test } from "node:test"
import { polishCv } from "../../documents/ai-compose"
import type { CvDocument } from "../../documents/model"

const doc = {
  version: 1, language: "en", template: "classic", accent: "#2563eb", missingTranslations: [],
  header: { name: "A", headline: "Cloud engineer", email: "", phone: "", location: "", links: [], photoPath: null, showPhoto: false },
  sections: [
    { id: "exp", kind: "experience", title: "Experience", included: true, groups: [], items: [{ entryId: "e1", title: "Engineer", organization: "Oracle", included: true, bullets: [{ id: "b1", text: "Built Go automation on OCI", factIds: ["f1"], included: true }] }] },
    { id: "sk", kind: "skills", title: "Skills", included: true, items: [], groups: [{ label: "Tools", values: ["Excel", "Go", "OCI"] }] },
  ],
} as unknown as CvDocument

const reply = (value: unknown) => async () => ({ text: JSON.stringify(value), model: "fake", inputTokens: 1, outputTokens: 1 })

test("polish: accepts exact permutations and grounded headlines", async () => {
  const result = await polishCv(doc, { title: "Staff Security Engineer", company: "X", description: "" }, reply({ headline: "Cloud engineer, Go automation on OCI", sections: [{ id: "sk", groups: [{ id: "G1", values: ["Go", "OCI", "Excel"] }] }] }))
  assert.deepEqual(result.doc.sections[1].groups[0].values, ["Go", "OCI", "Excel"])
  assert.equal(result.doc.header.headline, "Cloud engineer, Go automation on OCI")
})

test("polish: rejects added skills, dropped values and copied job titles", async () => {
  const result = await polishCv(doc, { title: "Staff Security Engineer", company: "X", description: "" }, reply({ headline: "Staff Security Engineer", sections: [{ id: "sk", groups: [{ id: "G1", values: ["Go", "Rust", "OCI"] }] }, { id: "exp", items: [] }] }))
  assert.deepEqual(result.doc.sections[1].groups[0].values, ["Excel", "Go", "OCI"])
  assert.equal(result.doc.header.headline, "Cloud engineer")
  const kubernetes = await polishCv(doc, { title: "Y", company: "X", description: "" }, reply({ headline: "Kubernetes cloud engineer", sections: [] }))
  assert.equal(kubernetes.doc.header.headline, "Cloud engineer", "new skill in headline rejected")
})
