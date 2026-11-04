import "server-only"
import { env, llmConfigured } from "@/lib/env"

export type Completion = { text: string; inputTokens: number | null; outputTokens: number | null; model: string }
export type Complete = (input: { system: string; user: string; maxTokens?: number }) => Promise<Completion>

/** Any OpenAI-compatible chat endpoint (DeepSeek, OpenAI, Ollama, …), JSON mode. */
export const completeJson: Complete = async ({ system, user, maxTokens = 2000 }) => {
  if (!llmConfigured) throw new Error("No language model configured (set LLM_API_KEY in .env.local).")
  const response = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(env.LLM_API_KEY ? { authorization: `Bearer ${env.LLM_API_KEY}` } : {}) },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      temperature: 0,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`Model call failed (${response.status}): ${(await response.text()).slice(0, 200)}`)
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string }
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? null,
    outputTokens: data.usage?.completion_tokens ?? null,
    model: data.model ?? env.LLM_MODEL,
  }
}
