import assert from "node:assert/strict"
import { test } from "node:test"
import { choice, noul, score } from "./jev"
import { cloudflareDecisionClient, openaiDecisionClient } from "./providers"

test("Cloudflare uses the Workers AI envelope and splits batches at 64 questions", async () => {
  const sizes: number[] = []
  const accountId = "a".repeat(32)
  const decide = cloudflareDecisionClient({ accountId, apiKey: "test-token", model: "clef" }, async (url, init) => {
    assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/cloudflare/clef`)
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-token")
    const request = JSON.parse(String(init?.body))
    assert.equal(request.model, "clef")
    assert.deepEqual(request.state, { job: "Developer" })
    const ids = Object.keys(request.questions)
    sizes.push(ids.length)
    return Response.json({
      success: true,
      result: {
        model: "clef",
        answers: Object.fromEntries(ids.map((id) => [id, { type: "noul", noul: 0.9 }])),
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    })
  })
  const result = await decide({ job: "Developer" }, Object.fromEntries(
    Array.from({ length: 65 }, (_, index) => [`q${index}`, noul("Is this a developer role?")]),
  ))
  assert.deepEqual(sizes, [64, 1])
  assert.equal(Object.keys(result.answers).length, 65)
  assert.equal(result.usage.input_tokens, 20)
})

test("OpenAI translates predicates, choices, and scores to the shared decision format", async () => {
  const decide = openaiDecisionClient({ apiKey: "test-key", model: "gpt-6-luna" }, async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/decisions")
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: "gpt-6-luna",
      input: '{"job":"Developer"}',
      questions: [
        { type: "predicate", name: "remote", instructions: "Is this remote?\nTrue criterion: Fully remote\nFalse criterion: Office required" },
        { type: "choice", name: "type", instructions: "What role?", choices: [{ value: "dev", description: "Developer" }, { value: "other", description: "Other" }] },
        { type: "score", name: "fit", instructions: "How close is the fit?", levels: [{ label: "0", description: "Poor" }, { label: "1", description: "Strong" }] },
      ],
    })
    return Response.json({
      model: "gpt-6-luna",
      usage: { input_tokens: 30, output_tokens: 0 },
      answers: [
        { name: "type", type: "choice", choice: "dev", confidence: 0.8, probabilities: [{ value: "dev", probability: 0.9 }, { value: "other", probability: 0.1 }] },
        { name: "fit", type: "score", score: 0.7, confidence: 0.6, probabilities: [{ value: 0, probability: 0.3 }, { value: 1, probability: 0.7 }] },
        { name: "remote", type: "predicate", probability: 0.2 },
      ],
    })
  })
  const result = await decide({ job: "Developer" }, {
    remote: noul("Is this remote?", { true: "Fully remote", false: "Office required" }),
    type: choice("What role?", { dev: "Developer", other: "Other" }),
    fit: score("How close is the fit?", ["Poor", "Strong"]),
  })
  assert.deepEqual(result.answers, {
    type: { type: "choice", choice: "dev", confidence: 0.8, probabilities: { dev: 0.9, other: 0.1 } },
    fit: { type: "score", score: 0.7, confidence: 0.6, probabilities: { 0: 0.3, 1: 0.7 } },
    remote: { type: "noul", noul: 0.2 },
  })
})

test("OpenAI treats a refusal as a failed decision", async () => {
  const decide = openaiDecisionClient({ apiKey: "test-key", model: "gpt-6-luna" }, async () => Response.json({
    model: "gpt-6-luna",
    usage: { input_tokens: 10, output_tokens: 0 },
    answers: [{ name: "check", type: "refusal" }],
  }))
  await assert.rejects(decide("Some text", { check: noul("Is this a job listing?") }), /declined/)
})
