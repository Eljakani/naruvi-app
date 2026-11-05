import "server-only"
import { eq } from "drizzle-orm"
import { env } from "@/lib/env"
import { db } from "@/server/db/client"
import { settings } from "@/server/db/schema"
import { decryptSecret, encryptionReady } from "./encryption"
import { SettingsError } from "./errors"
import { isLocalModel, LLM_SETTINGS_KEY, prepareLlmSettings, storedLlmSettings } from "./llm-schema"

async function readStored() {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, LLM_SETTINGS_KEY) })
  if (!row) return null
  const parsed = storedLlmSettings.safeParse(row.value)
  if (!parsed.success) throw new SettingsError("The saved model configuration is invalid. Save it again in Settings.")
  return parsed.data
}

function defaults() {
  return { baseUrl: env.LLM_BASE_URL.replace(/\/+$/, ""), model: env.LLM_MODEL, apiKey: env.LLM_API_KEY }
}

/** Safe DTO: never contains a plaintext key, a masked key, or ciphertext. */
export async function getLlmOverview() {
  const stored = await readStored()
  const baseUrl = stored?.baseUrl ?? defaults().baseUrl
  const model = stored?.model ?? env.LLM_MODEL
  const hasKey = stored ? Boolean(stored.encryptedApiKey) : Boolean(env.LLM_API_KEY)
  const ready = encryptionReady(env.SETTINGS_ENCRYPTION_KEY)
  const keyUsable = hasKey && (!stored || ready)
  return {
    baseUrl, model, hasKey,
    configured: keyUsable || (!hasKey && isLocalModel(baseUrl)),
    encryptionReady: ready,
    keySource: hasKey ? (stored ? "database" as const : "environment" as const) : "none" as const,
  }
}
export type LlmOverview = Awaited<ReturnType<typeof getLlmOverview>>

/** Read fresh for every call. Decrypt only on the server immediately before use. */
export async function getLlmConfiguration() {
  const stored = await readStored()
  if (!stored) {
    const fallback = defaults()
    return { ...fallback, configured: Boolean(fallback.apiKey) || isLocalModel(fallback.baseUrl) }
  }
  const apiKey = stored.encryptedApiKey ? decryptSecret(stored.encryptedApiKey, env.SETTINGS_ENCRYPTION_KEY, `llm:${stored.baseUrl}`) : ""
  return { baseUrl: stored.baseUrl, model: stored.model, apiKey, configured: Boolean(apiKey) || isLocalModel(stored.baseUrl) }
}

export async function saveLlmSettings(input: unknown) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(settings).where(eq(settings.key, LLM_SETTINGS_KEY)).for("update")
    const previous = row ? storedLlmSettings.parse(row.value) : null
    const value = prepareLlmSettings(input, previous, defaults(), env.SETTINGS_ENCRYPTION_KEY)
    await tx.insert(settings).values({ key: LLM_SETTINGS_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  })
  return getLlmOverview()
}
