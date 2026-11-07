import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { providerForEndpoint } from "@/lib/ai-providers"

export function isAnthropicEndpoint(baseUrl: string) {
  return providerForEndpoint(baseUrl)?.id === "anthropic"
}

export function languageModel(config: { baseUrl: string; model: string; apiKey: string }, fetcher: typeof fetch = fetch) {
  const options = {
    baseURL: config.baseUrl,
    apiKey: config.apiKey || undefined,
    fetch: ((url, init) => fetcher(url, { ...init, redirect: "error" })) satisfies typeof fetch,
  }
  if (isAnthropicEndpoint(config.baseUrl)) return createAnthropic(options)(config.model)
  return createOpenAICompatible({
    ...options, name: "naruvi", supportsStructuredOutputs: false,
    transformRequestBody: providerForEndpoint(config.baseUrl)?.id === "openai"
      ? ({ max_tokens, ...body }) => ({ ...body, max_completion_tokens: max_tokens })
      : undefined,
  }).chatModel(config.model)
}
