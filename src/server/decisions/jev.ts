/**
 * TypeSafe Jev ("System One") client: typed, calibrated decisions — no text
 * generation. Used for classification and verification; the language model
 * stays responsible for writing.
 * API: POST https://api.typesafe.ai/v1/systemone (Bearer key).
 */
import { z } from "zod"

export const JEV_URL = "https://api.typesafe.ai/v1/systemone"
/** OpenRouter serves the same System One request and response shapes; only the URL and the key differ. */
export const OPENROUTER_JEV_URL = "https://openrouter.ai/api/v1/systemone"

export type Criteria = string | Record<string, unknown> | unknown[] | null
export type Question =
  | { type: "choice"; instructions: Criteria; criteria: Record<string, Criteria> }
  | { type: "score"; instructions: Criteria; criteria: Criteria[] }
  | { type: "noul"; instructions: Criteria; criteria?: { true: Criteria; false: Criteria } }

export const choice = (instructions: Criteria, criteria: Record<string, Criteria>): Question => ({ type: "choice", instructions, criteria })
export const noul = (instructions: Criteria, criteria?: { true: Criteria; false: Criteria }): Question => ({ type: "noul", instructions, ...(criteria ? { criteria } : {}) })
export const score = (instructions: Criteria, criteria: Criteria[]): Question => ({ type: "score", instructions, criteria })

const answer = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), choice: z.string(), confidence: z.number(), probabilities: z.record(z.string(), z.number()) }),
  z.object({ type: z.literal("score"), score: z.number(), confidence: z.number(), probabilities: z.record(z.string(), z.number()) }),
  z.object({ type: z.literal("noul"), noul: z.number() }),
])
export const decisionResponse = z.object({ model: z.string(), answers: z.record(z.string(), answer), usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }) })
export type DecisionAnswer = z.infer<typeof answer>
export type DecisionResult = z.infer<typeof decisionResponse>

export type DecisionConfig = { apiKey: string; model: string }
export type Decide = (state: unknown, questions: Record<string, Question>) => Promise<DecisionResult>

export class DecisionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

type RequestOptions = { fetcher?: typeof fetch; timeoutMs?: number; retries?: number }

export function decisionRequest(apiKey: string, { fetcher = fetch, timeoutMs = 20_000, retries = 2 }: RequestOptions = {}) {
  return async (url: string, body: unknown): Promise<unknown> => {
    if (!apiKey) throw new DecisionError("No decision model key configured.")
    for (let attempt = 0; ; attempt += 1) {
      let res: Response
      try {
        res = await fetcher(url, {
          method: "POST",
          redirect: "error",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        if (attempt < retries) continue
        throw new DecisionError("Couldn’t reach the decision model.")
      }
      if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < retries) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || 400 * 2 ** attempt
        await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 5000)))
        continue
      }
      // Never surface the provider's body: it may echo the request.
      if (res.status === 401) throw new DecisionError("The decision model rejected the API key. Check it in Integrations.", 401)
      if (res.status === 402) throw new DecisionError("The decision model provider reports no credit left on this account. Add credit there, then try again.", 402)
      if (!res.ok) throw new DecisionError(`The decision model returned HTTP ${res.status}.`, res.status)
      return res.json().catch(() => null)
    }
  }
}

export function parseDecisionResponse(raw: unknown): DecisionResult {
  const parsed = decisionResponse.safeParse(raw)
  if (!parsed.success) throw new DecisionError("The decision model returned an unexpected response.")
  return parsed.data
}

/** One request answers every question in parallel against the same state. */
export function jevClient(config: DecisionConfig, options?: RequestOptions & { url?: string }): Decide {
  const request = decisionRequest(config.apiKey, options)
  return async (state, questions) => {
    if (!config.apiKey) throw new DecisionError("No decision model key configured.")
    if (!Object.keys(questions).length) return emptyDecision(config.model)
    return parseDecisionResponse(await request(options?.url ?? JEV_URL, { model: config.model, state, questions }))
  }
}

export function emptyDecision(model: string): DecisionResult {
  return { model, answers: {}, usage: { input_tokens: 0, output_tokens: 0 } }
}

const CHUNKS_AT_ONCE = 3

/** Splits many questions into requests that stay well under the context limit. */
export async function decideInChunks(decide: Decide, state: unknown, questions: Record<string, Question>, size = 120): Promise<DecisionResult> {
  const entries = Object.entries(questions)
  const chunks: [string, Question][][] = []
  for (let offset = 0; offset < entries.length; offset += size) chunks.push(entries.slice(offset, offset + size))
  const merged = emptyDecision("")
  // Chunks share nothing but the state: a few at a time instead of one after the other.
  for (let offset = 0; offset < chunks.length; offset += CHUNKS_AT_ONCE) {
    const results = await Promise.all(chunks.slice(offset, offset + CHUNKS_AT_ONCE).map((chunk) => decide(state, Object.fromEntries(chunk))))
    for (const result of results) {
      merged.model = result.model
      Object.assign(merged.answers, result.answers)
      merged.usage.input_tokens += result.usage.input_tokens
      merged.usage.output_tokens += result.usage.output_tokens
    }
  }
  return merged
}
