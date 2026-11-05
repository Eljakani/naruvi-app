import assert from "node:assert/strict"
import test from "node:test"
import { filterRequirements } from "../../analysis/filter"
import { extractRequirementCandidates, extractRequirements } from "../../analysis/requirements"
import type { CompletionInput } from "../../llm/transport"

const hrStep = "Échange RH: On discute de vos motivations et de l'adéquation avec nos valeurs (promis, pas de robotisation ici)."
const operationalStep = "Échange opérationnel: Je propose votre candidature au référent (Commercial, SDM, coordinateur...) du compte client, qui échange ensuite avec vous afin de valider votre adéquation avec le besoin."
const posting = `Votre profil\n- Maîtrise de Terraform et de Kubernetes\n- ${hrStep}\n- ${operationalStep}\n- Expérience en vente de solutions cloud\n- Expérience en ressources humaines\n\nVos missions\n- Conduire des entretiens de recrutement pour nos clients\n\nAvantages\n- Une mutuelle et des tickets restaurant`
const fake = (classifications: unknown[]) => async () => ({ text: JSON.stringify({ classifications }), model: "fixture-model" })

test("the screenshot's interview steps are not requirements even without AI", () => {
  const extracted = extractRequirementCandidates(posting)
  assert.ok(!extracted.requirements.some((item) => item.text === hrStep || item.text === operationalStep))
  assert.equal(extracted.excluded.filter((item) => item.category === "recruitment_process").length, 2)
  assert.ok(extracted.requirements.some((item) => /ressources humaines/.test(item.text)))
  assert.ok(extracted.requirements.some((item) => /vente de solutions/.test(item.text)))
  assert.ok(extracted.requirements.some((item) => /Conduire des entretiens/.test(item.text)))
})

test("headless fallback never reintroduces excluded interview processes or benefits", () => {
  assert.equal(extractRequirements(`Processus de recrutement\n- Un appel avec notre recruteur\n- Rencontre du manager\n\nBenefits\n- Free lunch`).length, 0)
  assert.equal(extractRequirements(`- ${hrStep}\n- ${operationalStep}`).length, 0)
  assert.equal(extractRequirements("Unknown heading\n- Experience with Rust").length, 1)
})

test("AI classifies all posting candidates before evidence matching, including potential gaps", async () => {
  const extraction = extractRequirementCandidates(posting)
  let called = false
  const result = await filterRequirements(extraction, posting, async (input: CompletionInput) => {
    called = true
    const payload = JSON.parse(input.user)
    assert.equal(payload.items.length, extraction.candidates.length)
    assert.ok(payload.items.some((item: { text: string }) => item.text === hrStep))
    assert.ok(!("profile" in payload))
    assert.ok(!("facts" in payload))
    assert.match(input.system, /UNTRUSTED DATA/)
    return fake(extraction.candidates.map((item) => ({ id: item.id, category: item.text === hrStep || item.text === operationalStep ? "recruitment_process" : item.text.includes("mutuelle") ? "benefits" : item.text.startsWith("Conduire") ? "responsibility" : "must", reason: "Classified by who performs the action and its purpose." })))()
  })
  assert.equal(called, true)
  assert.equal(result.summary.status, "applied")
  assert.equal(result.requirements.length, 4)
  assert.equal(result.summary.excluded.length, 3)
  assert.ok(result.summary.excluded.every((item) => item.source === "model"))
  assert.ok(result.requirements.some((item) => /ressources humaines/.test(item.text)))
})

test("AI can rescue genuine duties from an overly broad section rule", async () => {
  const extraction = extractRequirementCandidates("Our tech\n- Maintain Kubernetes clusters in production")
  assert.equal(extraction.requirements.length, 0)
  const result = await filterRequirements(extraction, "Our tech", fake([{ id: "r1", category: "responsibility", reason: "An actual duty of this advertised role." }]))
  assert.equal(result.requirements[0].kind, "responsibility")
  assert.equal(result.summary.excluded.length, 0)
})

test("unknown IDs, invented wording, duplicated decisions and omissions cannot silently delete a requirement", async () => {
  const extraction = extractRequirementCandidates("Requirements\n- Rust experience\n- Python experience")
  const result = await filterRequirements(extraction, "Requirements", fake([
    { id: "invented", category: "must", reason: "Fake", text: "Invented Azure requirement" },
    { id: "r1", category: "other", reason: "Conflicting deletion" },
    { id: "r1", category: "must", reason: "Conflicting retention" },
  ]))
  assert.deepEqual(result.requirements, extraction.requirements)
  const original = await filterRequirements(extraction, "Requirements", fake([{ id: "r1", category: "nice", reason: "Explicitly optional", text: "Invented new requirement" }]))
  assert.equal(original.requirements[0].text, "Rust experience")
  assert.equal(original.requirements[0].kind, "nice")
  assert.equal(original.requirements[1].text, "Python experience")
  assert.equal(original.summary.status, "partial")
})

test("invalid output or unavailable AI retains the rules-only baseline and safely reports fallback", async () => {
  const extraction = extractRequirementCandidates(posting)
  const offline = await filterRequirements(extraction, posting)
  assert.equal(offline.summary.status, "not_configured")
  assert.deepEqual(offline.requirements, extraction.requirements)
  for (const complete of [async () => ({ text: "not JSON" }), async () => { throw new Error("provider-secret-body") }]) {
    const result = await filterRequirements(extraction, posting, complete)
    assert.equal(result.summary.status, "failed")
    assert.deepEqual(result.requirements, extraction.requirements)
    assert.ok(!result.summary.message?.includes("provider-secret-body"))
  }
})

test("every candidate can be excluded when the posting only describes hiring steps", async () => {
  const extraction = extractRequirementCandidates(`- ${hrStep}\n- ${operationalStep}`)
  const result = await filterRequirements(extraction, posting, fake(extraction.candidates.map((item) => ({ id: item.id, category: "recruitment_process", reason: "The candidate goes through this interview stage." }))))
  assert.equal(result.requirements.length, 0)
  assert.equal(result.summary.excluded.length, 2)
  assert.equal(result.summary.status, "applied")
})

test("large postings are batched and unreviewed overflow is preserved", async () => {
  const text = `Requirements\n${Array.from({ length: 125 }, (_, index) => `- Requirement ${index + 1}: Python experience`).join("\n")}`
  const extraction = extractRequirementCandidates(text)
  let calls = 0
  const result = await filterRequirements(extraction, text, async (input) => {
    calls += 1
    const payload = JSON.parse(input.user)
    assert.ok(payload.items.length <= 24)
    return fake(payload.items.map((item: { id: string }) => ({ id: item.id, category: "must", reason: "Candidate qualification." })))()
  })
  assert.equal(calls, 5)
  assert.equal(result.summary.reviewed, 120)
  assert.equal(result.requirements.length, 125)
  assert.equal(result.summary.status, "partial")
})
