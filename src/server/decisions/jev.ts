/**
 * TypeSafe Jev ("System One") client: typed, calibrated decisions — no text
 * generation. Used for classification and verification; the language model
 * stays responsible for writing.
 * API: POST https://api.typesafe.ai/v1/systemone (Bearer key).
 */
import { z } from "zod"

export const JEV_URL = "https://api.typesafe.ai/v1/systemone"

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
const response = z.object({ model: z.string(), answers: z.record(z.string(), answer), usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }) })
export type DecisionAnswer = z.infer<typeof answer>
export type DecisionResult = z.infer<typeof response>

export type DecisionConfig = { apiKey: string; model: string }
export type Decide = (state: unknown, questions: Record<string, Question>) => Promise<DecisionResult>

export class DecisionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

/** One request answers every question in parallel against the same state. */
export function jevClient(config: DecisionConfig, { fetcher = fetch, timeoutMs = 20_000, retries = 2 }: { fetcher?: typeof fetch; timeoutMs?: number; retries?: number } = {}): Decide {
  return async (state, questions) => {
    if (!config.apiKey) throw new DecisionError("No decision model key configured.")
    const ids = Object.keys(questions)
    if (!ids.length) return { model: config.model, answers: {}, usage: { input_tokens: 0, output_tokens: 0 } }
    for (let attempt = 0; ; attempt += 1) {
      let res: Response
      try {
        res = await fetcher(JEV_URL, {
          method: "POST",
          redirect: "error",
          headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: config.model, state, questions }),
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
      if (res.status === 401) throw new DecisionError("The decision model rejected the API key. Check it in Settings.", 401)
      if (!res.ok) throw new DecisionError(`The decision model returned HTTP ${res.status}.`, res.status)
      const parsed = response.safeParse(await res.json().catch(() => null))
      if (!parsed.success) throw new DecisionError("The decision model returned an unexpected response.")
      return parsed.data
    }
  }
}

/** Splits many questions into requests that stay well under the context limit. */
export async function decideInChunks(decide: Decide, state: unknown, questions: Record<string, Question>, size = 120): Promise<DecisionResult> {
  const entries = Object.entries(questions)
  const merged: DecisionResult = { model: "", answers: {}, usage: { input_tokens: 0, output_tokens: 0 } }
  for (let offset = 0; offset < entries.length; offset += size) {
    const result = await decide(state, Object.fromEntries(entries.slice(offset, offset + size)))
    merged.model = result.model
    Object.assign(merged.answers, result.answers)
    merged.usage.input_tokens += result.usage.input_tokens
    merged.usage.output_tokens += result.usage.output_tokens
  }
  return merged
}
