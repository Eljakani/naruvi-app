import "server-only"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { env } from "@/lib/env"
import { db } from "@/server/db/client"
import { settings } from "@/server/db/schema"
import { jevClient, type Decide } from "@/server/decisions/jev"
import { decryptSecret, encryptionReady, encryptSecret } from "./encryption"
import { SettingsError } from "./errors"
import { DECISION_SETTINGS_KEY } from "./llm-schema"

const stored = z.object({ model: z.string().min(1).max(80), encryptedApiKey: z.string().nullable() })
const input = z.object({
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
  return { model: value?.model ?? env.TYPESAFE_MODEL, hasKey, configured: hasKey && (!value?.encryptedApiKey || encryptionReady(env.SETTINGS_ENCRYPTION_KEY)), keySource: hasKey ? (value ? "database" as const : "environment" as const) : "none" as const }
}
export type DecisionOverview = Awaited<ReturnType<typeof getDecisionOverview>>

/** A decision client when Jev is configured, else null (callers fall back). */
export async function decisionClient(): Promise<{ decide: Decide; model: string } | null> {
  const value = await readStored().catch(() => null)
  const model = value?.model ?? env.TYPESAFE_MODEL
  const apiKey = value ? (value.encryptedApiKey ? decryptSecret(value.encryptedApiKey, env.SETTINGS_ENCRYPTION_KEY, `jev:${model}`) : "") : env.TYPESAFE_API_KEY
  return apiKey ? { decide: jevClient({ apiKey, model }), model } : null
}

export async function saveDecisionSettings(raw: unknown) {
  const value = input.parse(raw)
  const previous = await readStored()
  if (value.apiKey && !encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key) so the key can be stored encrypted.")
  let encryptedApiKey = previous?.encryptedApiKey ?? null
  // The key is bound to the model id; re-encrypt when the model changes.
  if (encryptedApiKey && previous && previous.model !== value.model && !value.apiKey) {
    const plain = decryptSecret(encryptedApiKey, env.SETTINGS_ENCRYPTION_KEY, `jev:${previous.model}`)
    encryptedApiKey = encryptSecret(plain, env.SETTINGS_ENCRYPTION_KEY, `jev:${value.model}`)
  }
  if (value.removeKey) encryptedApiKey = null
  else if (value.apiKey) encryptedApiKey = encryptSecret(value.apiKey, env.SETTINGS_ENCRYPTION_KEY, `jev:${value.model}`)
  const next = { model: value.model, encryptedApiKey }
  await db.insert(settings).values({ key: DECISION_SETTINGS_KEY, value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } })
  return getDecisionOverview()
}

/** Cheap live check with one trivial question. */
export async function testDecisionModel() {
  const client = await decisionClient()
  if (!client) return { ok: false, message: "No decision model key configured." }
  try {
    const result = await client.decide("The sky is blue.", { check: { type: "noul", instructions: "The statement is about the sky" } })
    return { ok: true, message: `${result.model} answered (${result.usage.input_tokens} input tokens).` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The decision model test failed." }
  }
}
