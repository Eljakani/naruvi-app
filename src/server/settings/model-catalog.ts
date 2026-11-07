import "server-only"
import { z } from "zod"
import { providerForEndpoint } from "@/lib/ai-providers"
import { isAnthropicEndpoint } from "@/server/llm/provider"
import { SettingsError } from "./errors"

const modelCatalog = z.object({
  data: z.array(z.object({ id: z.string(), display_name: z.string().nullish(), name: z.string().nullish() })),
})

export async function listProviderModels({ baseUrl, apiKey }: { baseUrl: string; apiKey: string }) {
  // Custom servers vary widely. Use manual entry instead of probing arbitrary URLs.
  const provider = providerForEndpoint(baseUrl)
  if (!provider) throw new SettingsError("Enter the model ID from your server's dashboard.")
  const headers = new Headers({ Accept: "application/json" })
  if (isAnthropicEndpoint(baseUrl)) {
    headers.set("anthropic-version", "2023-06-01")
    if (apiKey) headers.set("x-api-key", apiKey)
  } else if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`)
  const response = await fetch(`${baseUrl}/models`, {
    headers, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 401 || response.status === 403) throw new SettingsError("The provider rejected access. Check your API key and its permissions.")
  if (!response.ok) throw new SettingsError("This provider didn't return a model list. Enter the model ID manually.")
  const result = modelCatalog.safeParse(await response.json())
  if (!result.success) throw new SettingsError("This provider didn't return a model list. Enter the model ID manually.")
  const unique = new Map<string, string>()
  for (const { id: rawId, display_name, name } of result.data.data) {
    const id = provider.id === "gemini" ? rawId.replace(/^models\//, "") : rawId
    if (id && id.length <= 160 && !unique.has(id)) unique.set(id, (display_name || name)?.slice(0, 160) || id)
    if (unique.size >= 1000) break
  }
  return [...unique].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
}
