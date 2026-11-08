import { APICallError, generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output, zodSchema } from "ai"
import { isAnthropicEndpoint, languageModel } from "./provider"
import type { z } from "zod"
import { SettingsError } from "@/server/settings/errors"
import { AiRequestError, type AiRequestMetrics } from "./errors"

export type ModelConfiguration = { baseUrl: string; model: string; apiKey: string; configured: boolean }
export type CompletionInput = { system: string; user: string; maxTokens?: number; schema?: z.ZodType; reasoning?: "none" | "low" | "high" }
export type Completion = { text: string; inputTokens: number | null; outputTokens: number | null; model: string; requestId?: string; finishReason?: string; attempts?: number }

/** Shared AI SDK runtime; credentials stay server-side and errors never expose provider payloads. */
export async function requestCompletion(config: ModelConfiguration, input: CompletionInput, { timeoutMs = 90_000, jsonMode = true, fetcher = fetch }: { timeoutMs?: number; jsonMode?: boolean; fetcher?: typeof fetch } = {}): Promise<Completion> {
  if (!config.configured) throw new SettingsError("No language model configured. Add an API key in Integrations.")
  let attempts = 0
  let metrics: AiRequestMetrics = { model: config.model, inputTokens: null, outputTokens: null, attempts: 0 }
  const deepseek = new URL(config.baseUrl).hostname === "api.deepseek.com"
  const reasoning = input.reasoning ?? "none"
  const model = languageModel(config, (url, init) => {
    attempts += 1
    return fetcher(url, init)
  })
  const nativeSchema = jsonMode && isAnthropicEndpoint(config.baseUrl) && input.schema
  try {
    const schemaInstructions = jsonMode && input.schema ? `\nReturn JSON matching this exact schema (including enum values):\n${JSON.stringify(await zodSchema(input.schema).jsonSchema)}` : ""
    const ask = (prompt: string) => generateText({
      model,
      system: input.system + schemaInstructions, prompt,
      maxOutputTokens: input.maxTokens ?? 2000,
      maxRetries: 1, abortSignal: AbortSignal.timeout(timeoutMs),
      // DeepSeek currently enables high thinking by default. For bounded JSON
      // editing, keep the output budget for the answer. Future reasoning-heavy
      // workflows can request low/high explicitly through the same SDK runtime.
      providerOptions: deepseek ? { naruvi: { thinking: { type: reasoning === "none" ? "disabled" : "enabled" }, ...(reasoning === "none" ? {} : { reasoningEffort: reasoning }) } } : undefined,
      output: nativeSchema ? Output.object({ schema: nativeSchema }) : jsonMode ? Output.json() : Output.text(),
      include: { requestBody: false, responseBody: false },
    })
    // One repair round: models occasionally return JSON that is almost right
    // (a missing field, a wrong enum). Tell them exactly what was wrong.
    let result!: Awaited<ReturnType<typeof ask>>
    let parsed: ReturnType<z.ZodType["safeParse"]> | null = null
    let usedIn = 0
    let usedOut = 0
    let prompt = input.user
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await ask(prompt)
      } catch (error) {
        // Truncated output is a budget problem, not a format one: don't retry it.
        const truncated = NoObjectGeneratedError.isInstance(error) && error.finishReason === "length"
        if (attempt === 0 && jsonMode && !truncated && (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error))) {
          prompt = `${input.user}\n\nYour previous answer was not valid JSON. Return valid JSON only.`
          continue
        }
        throw error
      }
      usedIn += result.usage.inputTokens ?? 0
      usedOut += result.usage.outputTokens ?? 0
      parsed = jsonMode && input.schema ? input.schema.safeParse(result.output) : null
      if (!parsed || parsed.success || result.finishReason === "length" || attempt === 1) break
      const problem = parsed.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`).join("; ")
      prompt = `${input.user}\n\nYour previous answer did not match the schema (${problem}). Return the corrected JSON only.`
    }
    metrics = { model: config.model, inputTokens: usedIn || null, outputTokens: usedOut || null, attempts, finishReason: result.finishReason }
    if (result.finishReason === "length") throw new SettingsError("The AI response reached its output limit before completing the document. Try again or use a model with a larger output budget.")
    if (parsed && !parsed.success) throw new SettingsError("The model returned JSON that did not match this workflow's schema. The standard draft was kept; try again or check the model in Integrations.")
    const text = jsonMode ? JSON.stringify(parsed?.success ? parsed.data : result.output) : result.text
    if (!text) throw new SettingsError("The model returned no usable output. Check the model in Integrations.")
    return {
      text, model: config.model,
      inputTokens: usedIn || null, outputTokens: usedOut || null,
      requestId: result.response.id, finishReason: result.finishReason, attempts,
    }
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) metrics = { model: config.model, inputTokens: error.usage?.inputTokens ?? null, outputTokens: error.usage?.outputTokens ?? null, attempts, finishReason: error.finishReason }
    else metrics.attempts = attempts
    if (error instanceof SettingsError) throw new AiRequestError(error.message, metrics)
    if (APICallError.isInstance(error) && error.statusCode) throw new AiRequestError(`The model endpoint returned HTTP ${error.statusCode}. Check the endpoint, model and API key in Integrations.`, metrics)
    if (metrics.finishReason === "length") throw new AiRequestError("The AI response reached its output limit before completing the document. The original draft was kept.", metrics)
    if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) throw new AiRequestError("The model returned invalid or incomplete structured output. The standard draft was kept; check the model in Integrations or try again.", metrics)
    throw new AiRequestError("The AI request failed. Check the endpoint, model and connection in Integrations, then try again.", metrics)
  }
}
