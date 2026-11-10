import { z } from "zod"
import { DecisionError, decideInChunks, decisionRequest, emptyDecision, parseDecisionResponse, type Decide, type DecisionConfig, type Question } from "./jev"

const cloudflareResponse = z.object({ success: z.literal(true), result: z.unknown() })
const openaiResponse = z.object({
  model: z.string(),
  usage: z.unknown(),
  answers: z.array(z.object({
    name: z.string(),
    type: z.string(),
    probability: z.number().optional(),
    choice: z.string().optional(),
    score: z.number().optional(),
    confidence: z.number().optional(),
    probabilities: z.array(z.object({ value: z.union([z.string(), z.number()]), probability: z.number() })).optional(),
  })),
})

export function cloudflareDecisionClient(config: DecisionConfig & { accountId: string }, fetcher?: typeof fetch): Decide {
  const request = decisionRequest(config.apiKey, { fetcher })
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/run/@cf/cloudflare/${encodeURIComponent(config.model)}`
  return async (state, questions) => {
    if (!Object.keys(questions).length) return emptyDecision(config.model)
    return decideInChunks(async (state, questions) => {
      const parsed = cloudflareResponse.safeParse(await request(url, { model: config.model, state, questions }))
      if (!parsed.success) throw new DecisionError("Cloudflare Workers AI returned an unexpected response.")
      const result = parseDecisionResponse(parsed.data.result)
      if (Object.entries(questions).some(([name, question]) => result.answers[name]?.type !== question.type)) {
        throw new DecisionError("Cloudflare Workers AI did not answer every question as requested.")
      }
      return result
    }, state, questions, 64)
  }
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? ""
}

function openaiQuestion(name: string, question: Question) {
  const instructions = asText(question.instructions)
  switch (question.type) {
    case "noul":
      return {
        type: "predicate", name,
        instructions: question.criteria
          ? `${instructions}\nTrue criterion: ${asText(question.criteria.true)}\nFalse criterion: ${asText(question.criteria.false)}`
          : instructions,
      }
    case "choice":
      return {
        type: "choice", name, instructions,
        choices: Object.entries(question.criteria).map(([value, criterion]) => ({ value, description: asText(criterion) })),
      }
    case "score":
      return {
        type: "score", name, instructions,
        levels: question.criteria.map((criterion, index) => ({ label: String(index), description: asText(criterion) })),
      }
  }
}

export function openaiDecisionClient(config: DecisionConfig, fetcher?: typeof fetch): Decide {
  const request = decisionRequest(config.apiKey, { fetcher })
  return async (state, questions) => {
    const entries = Object.entries(questions)
    if (!entries.length) return emptyDecision(config.model)
    const parsed = openaiResponse.safeParse(await request("https://api.openai.com/v1/decisions", {
      model: config.model,
      input: asText(state),
      questions: entries.map(([name, question]) => openaiQuestion(name, question)),
    }))
    if (!parsed.success) throw new DecisionError("OpenAI Decisions returned an unexpected response.")
    const answers = Object.fromEntries(parsed.data.answers.map((answer) => {
      const { name, type, probability, probabilities } = answer
      if (type === "refusal") throw new DecisionError("OpenAI Decisions declined to answer a question.")
      return [name, type === "predicate"
        ? { type: "noul", noul: probability }
        : { ...answer, probabilities: probabilities && Object.fromEntries(probabilities.map(({ value, probability }) => [value, probability])) }]
    }))
    const result = parseDecisionResponse({ ...parsed.data, answers })
    if (parsed.data.answers.length !== entries.length || entries.some(([name, question]) => result.answers[name]?.type !== question.type)) {
      throw new DecisionError("OpenAI Decisions did not answer every question as requested.")
    }
    return result
  }
}
