import "server-only"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { decisionProviders } from "@/lib/decision-providers"
import { env } from "@/lib/env"
import { db } from "@/server/db/client"
import { settings } from "@/server/db/schema"
import { DecisionError, jevClient, OPENROUTER_JEV_URL, type Decide } from "@/server/decisions/jev"
import { cloudflareDecisionClient, openaiDecisionClient } from "@/server/decisions/providers"
import { decryptSecret, encryptionReady, encryptSecret } from "./encryption"
import { SettingsError } from "./errors"
import { getLlmConfiguration } from "./llm"
import { DECISION_SETTINGS_KEY } from "./llm-schema"

const provider = z.enum(["typesafe", "openrouter", "cloudflare", "openai"])
const stored = z.object({
  provider: provider.default("typesafe"),
  model: z.string().min(1).max(80),
  accountId: z.string().optional(),
  encryptedApiKey: z.string().nullable(),
})
const keyBinding = (value: Pick<z.infer<typeof stored>, "provider" | "model">) =>
  `${value.provider === "typesafe" ? "jev" : value.provider}:${value.model}`
const input = z.object({
  provider: provider.default("typesafe"),
  accountId: z.string().trim().max(32).default(""),
  model: z.string().trim().min(1).max(80).regex(/^[a-z0-9.\-]+$/i, "Use a model id like jev-latest."),
  apiKey: z.string().trim().max(4096).regex(/^[^\r\n]*$/).default(""),
  removeKey: z.boolean().default(false),
  /** OpenRouter only: reuse the key already saved for the language model. */
  useLlmKey: z.boolean().default(false),
})
type Provider = z.infer<typeof provider>

function buildClient(config: { provider: Provider; model: string; accountId?: string; apiKey: string }): Decide | null {
  if (config.provider === "cloudflare") return config.accountId ? cloudflareDecisionClient({ ...config, accountId: config.accountId }) : null
  if (config.provider === "openai") return openaiDecisionClient(config)
  return jevClient(config, config.provider === "openrouter" ? { url: OPENROUTER_JEV_URL } : undefined)
}

/** The language model's key, when that model is reached through OpenRouter: one key then serves both. */
async function openRouterLlmKey() {
  const llm = await getLlmConfiguration().catch(() => null)
  if (!llm?.apiKey) return ""
  try { return new URL(llm.baseUrl).hostname === "openrouter.ai" ? llm.apiKey : "" }
  catch { return "" }
}

async function readStored() {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, DECISION_SETTINGS_KEY) })
  return row ? stored.parse(row.value) : null
}

/** Safe DTO: never includes the key. */
export async function getDecisionOverview() {
  const value = await readStored()
  const hasKey = value ? Boolean(value.encryptedApiKey) : Boolean(env.TYPESAFE_API_KEY)
  return { provider: value?.provider ?? "typesafe", accountId: value?.accountId ?? "", model: value?.model ?? env.TYPESAFE_MODEL, hasKey, configured: hasKey && (!value?.encryptedApiKey || encryptionReady(env.SETTINGS_ENCRYPTION_KEY)), keySource: hasKey ? (value ? "database" as const : "environment" as const) : "none" as const }
}
export type DecisionOverview = Awaited<ReturnType<typeof getDecisionOverview>>

/** A configured decision client, or null so callers can fall back. */
export async function decisionClient(): Promise<{ decide: Decide; model: string } | null> {
  const value = await readStored().catch(() => null)
  const model = value?.model ?? env.TYPESAFE_MODEL
  const apiKey = value
    ? (value.encryptedApiKey ? decryptSecret(value.encryptedApiKey, env.SETTINGS_ENCRYPTION_KEY, keyBinding(value)) : "")
    : env.TYPESAFE_API_KEY
  if (!apiKey) return null
  const decide = buildClient({ provider: value?.provider ?? "typesafe", model, accountId: value?.accountId, apiKey })
  return decide ? { decide, model } : null
}

export async function saveDecisionSettings(raw: unknown) {
  const value = input.parse(raw)
  const previous = await readStored()
  if (value.useLlmKey && !value.apiKey) {
    if (value.provider !== "openrouter") throw new SettingsError("Only an OpenRouter key can be shared with the decision model.")
    value.apiKey = await openRouterLlmKey()
    if (!value.apiKey) throw new SettingsError("No OpenRouter key is saved for the language model. Paste a key instead.")
  }
  if (value.provider !== "typesafe" && !decisionProviders[value.provider].models.includes(value.model)) {
    throw new SettingsError("Choose a supported decision model for this provider.")
  }
  if (value.provider === "cloudflare" && !/^[a-f0-9]{32}$/i.test(value.accountId)) {
    throw new SettingsError("Enter your 32-character Cloudflare account ID.")
  }
  if (value.provider !== (previous?.provider ?? "typesafe") && (!value.apiKey || value.removeKey)) {
    throw new SettingsError("Enter an API key for the selected provider.")
  }
  if (value.apiKey && !encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key) so the key can be stored encrypted.")
  let encryptedApiKey = previous?.encryptedApiKey ?? null
  if (value.removeKey) encryptedApiKey = null
  else if (value.apiKey) encryptedApiKey = encryptSecret(value.apiKey, env.SETTINGS_ENCRYPTION_KEY, keyBinding(value))
  else if (previous && encryptedApiKey && previous.model !== value.model) {
    const plain = decryptSecret(encryptedApiKey, env.SETTINGS_ENCRYPTION_KEY, keyBinding(previous))
    encryptedApiKey = encryptSecret(plain, env.SETTINGS_ENCRYPTION_KEY, keyBinding(value))
  }
  const next = { provider: value.provider, model: value.model, accountId: value.provider === "cloudflare" ? value.accountId : "", encryptedApiKey }
  await db.insert(settings).values({ key: DECISION_SETTINGS_KEY, value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } })
  return getDecisionOverview()
}

/** Cheap live check with one trivial question. */
async function probe(decide: Decide) {
  const result = await decide("The sky is blue.", { check: { type: "noul", instructions: "The statement is about the sky" } })
  return result.answers.check?.type === "noul" ? result : null
}

/**
 * First-run path: check the key with one question and save it only when the
 * model answers, so a mistyped key never leaves a broken decision model behind.
 */
export type ConnectFailure = "encryption" | "noKey" | "key" | "credit" | "unreachable" | "other"
export async function connectDecisionModel(raw: unknown): Promise<{ ok: true; overview: DecisionOverview } | { ok: false; reason: ConnectFailure; message: string }> {
  const value = input.parse(raw)
  const fail = (reason: ConnectFailure, message: string) => ({ ok: false as const, reason, message })
  if (!encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) return fail("encryption", "Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key) so the key can be stored encrypted.")
  const apiKey = value.apiKey || (value.useLlmKey && value.provider === "openrouter" ? await openRouterLlmKey() : "")
  if (!apiKey) return fail("noKey", "Paste an API key first.")
  const decide = buildClient({ provider: value.provider, model: value.model, accountId: value.accountId, apiKey })
  if (!decide) return fail("other", "Enter your 32-character Cloudflare account ID.")
  try {
    if (!await probe(decide)) return fail("other", "The decision model did not answer the test question.")
  } catch (error) {
    const status = error instanceof DecisionError ? error.status : undefined
    const message = error instanceof Error ? error.message : "The decision model test failed."
    return fail(status === 401 ? "key" : status === 402 ? "credit" : error instanceof DecisionError && !status ? "unreachable" : "other", message)
  }
  return { ok: true, overview: await saveDecisionSettings({ ...value, apiKey, useLlmKey: false, removeKey: false }) }
}

export async function testDecisionModel() {
  try {
    const client = await decisionClient()
    if (!client) return { ok: false, message: "No decision model key configured." }
    const result = await probe(client.decide)
    if (!result) return { ok: false, message: "The decision model did not answer the test question." }
    return { ok: true, message: `${result.model} answered (${result.usage.input_tokens} input tokens).` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The decision model test failed." }
  }
}
