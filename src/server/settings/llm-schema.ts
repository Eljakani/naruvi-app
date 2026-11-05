import { z } from "zod"
import { encryptSecret } from "./encryption"
import { SettingsError } from "./errors"

export const LLM_SETTINGS_KEY = "language-model"
export const DECISION_SETTINGS_KEY = "decision-model"
const baseUrl = z.string().trim().url("Enter a valid API base URL.").max(2000).refine((value) => {
  try {
    const url = new URL(value)
    return /^https?:$/.test(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  } catch { return false }
}, "Use an HTTP(S) base URL without credentials, query parameters or fragments.").transform((value) => new URL(value).href.replace(/\/+$/, ""))
const model = z.string().trim().min(1, "Enter a model name.").max(160)

export const storedLlmSettings = z.object({ baseUrl, model, encryptedApiKey: z.string().nullable() })
export type StoredLlmSettings = z.infer<typeof storedLlmSettings>
export const llmSettingsInput = z.object({
  baseUrl,
  model,
  apiKey: z.string().trim().max(4096, "The API key is too long.").regex(/^[^\r\n]*$/, "The API key must be a single line.").default(""),
  removeKey: z.boolean().default(false),
}).refine((input) => !(input.removeKey && input.apiKey), "Choose either a replacement key or removal.")

export function isLocalModel(baseUrl: string): boolean {
  const hostname = new URL(baseUrl).hostname.toLowerCase()
  return ["localhost", "127.0.0.1", "[::1]", "ollama"].includes(hostname)
}

/** Blank means keep; removal is explicit. Changing providers requires an explicit key decision. */
export function prepareLlmSettings(input: unknown, previous: StoredLlmSettings | null, fallback: { baseUrl: string; model: string; apiKey: string }, masterKey: string): StoredLlmSettings {
  const value = llmSettingsInput.parse(input)
  const previousUrl = baseUrl.parse(previous?.baseUrl ?? fallback.baseUrl)
  const hasExistingKey = previous ? Boolean(previous.encryptedApiKey) : Boolean(fallback.apiKey)
  if (hasExistingKey && previousUrl !== value.baseUrl && !value.apiKey && !value.removeKey) {
    throw new SettingsError("Enter a replacement API key or remove the existing key before changing the endpoint.")
  }
  let encryptedApiKey = previous?.encryptedApiKey ?? null
  if (value.removeKey) encryptedApiKey = null
  else if (value.apiKey) encryptedApiKey = encryptSecret(value.apiKey, masterKey, `llm:${value.baseUrl}`)
  else if (!previous && fallback.apiKey) encryptedApiKey = encryptSecret(fallback.apiKey, masterKey, `llm:${value.baseUrl}`)
  return { baseUrl: value.baseUrl, model: value.model, encryptedApiKey }
}

/** Credentials, including ciphertext, do not belong in portable user-data exports. */
export function exportableSettings<T extends { key: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.key !== LLM_SETTINGS_KEY && row.key !== DECISION_SETTINGS_KEY)
}
