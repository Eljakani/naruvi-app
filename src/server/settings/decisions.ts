import "server-only"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { decisionProviders } from "@/lib/decision-providers"
import { env } from "@/lib/env"
import { db } from "@/server/db/client"
import { settings } from "@/server/db/schema"
import { jevClient, type Decide } from "@/server/decisions/jev"
import { cloudflareDecisionClient, openaiDecisionClient } from "@/server/decisions/providers"
import { decryptSecret, encryptionReady, encryptSecret } from "./encryption"
import { SettingsError } from "./errors"
import { DECISION_SETTINGS_KEY } from "./llm-schema"

const provider = z.enum(["typesafe", "cloudflare", "openai"])
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
})

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
  const config = { apiKey, model }
  if (value?.provider === "cloudflare") {
    return value.accountId ? { decide: cloudflareDecisionClient({ ...config, accountId: value.accountId }), model } : null
  }
  if (value?.provider === "openai") return { decide: openaiDecisionClient(config), model }
  return { decide: jevClient(config), model }
}

export async function saveDecisionSettings(raw: unknown) {
  const value = input.parse(raw)
  const previous = await readStored()
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
export async function testDecisionModel() {
  try {
    const client = await decisionClient()
    if (!client) return { ok: false, message: "No decision model key configured." }
    const result = await client.decide("The sky is blue.", { check: { type: "noul", instructions: "The statement is about the sky" } })
    if (result.answers.check?.type !== "noul") return { ok: false, message: "The decision model did not answer the test question." }
    return { ok: true, message: `${result.model} answered (${result.usage.input_tokens} input tokens).` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The decision model test failed." }
  }
}
