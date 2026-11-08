import "server-only"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { env } from "@/lib/env"
import { providerLanguage, SPEECH_PROVIDERS, speechProvider, type SpeechProviderId } from "@/lib/speech-providers"
import { db } from "@/server/db/client"
import { settings } from "@/server/db/schema"
import { decryptSecret, encryptionReady, encryptSecret } from "./encryption"
import { SettingsError } from "./errors"

const KEY = "integration.speech"
const ids = SPEECH_PROVIDERS.map((provider) => provider.id) as [SpeechProviderId, ...SpeechProviderId[]]
const stored = z.object({ provider: z.enum(ids), model: z.string().min(1).max(80), encryptedApiKey: z.string().nullable() })
const input = z.object({
  provider: z.enum(ids),
  model: z.string().trim().min(1).max(80).regex(/^[\w.\-]+$/, "Use a model id like whisper-large-v3-turbo."),
  apiKey: z.string().trim().max(4096).regex(/^[^\r\n]*$/).default(""),
  removeKey: z.boolean().default(false),
})

async function readStored() {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, KEY) })
  const parsed = stored.safeParse(row?.value)
  return parsed.success ? parsed.data : null
}

/** Safe DTO: never includes the key. */
export async function getSpeechOverview() {
  const value = await readStored()
  return { provider: value?.provider ?? null, model: value?.model ?? null, hasKey: Boolean(value?.encryptedApiKey), configured: Boolean(value?.encryptedApiKey) && encryptionReady(env.SETTINGS_ENCRYPTION_KEY) }
}
export type SpeechOverview = Awaited<ReturnType<typeof getSpeechOverview>>

export async function saveSpeechSettings(raw: unknown) {
  const value = input.parse(raw)
  const previous = await readStored()
  if (value.apiKey && !encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key) so the key can be stored encrypted.")
  // A key belongs to one provider: switching provider without a new key drops the old one.
  let encryptedApiKey = previous && previous.provider === value.provider ? previous.encryptedApiKey : null
  if (value.removeKey) encryptedApiKey = null
  else if (value.apiKey) encryptedApiKey = encryptSecret(value.apiKey, env.SETTINGS_ENCRYPTION_KEY, `speech:${value.provider}`)
  const next = { provider: value.provider, model: value.model, encryptedApiKey }
  await db.insert(settings).values({ key: KEY, value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } })
  return getSpeechOverview()
}

/** 16-bit mono WAV in, text out. The audio is sent to the configured provider only. */
export async function transcribeSpeech(wav: Uint8Array, language: string): Promise<string> {
  const value = await readStored()
  if (!value?.encryptedApiKey) throw new SettingsError("Connect a speech provider in Integrations first.")
  const apiKey = decryptSecret(value.encryptedApiKey, env.SETTINGS_ENCRYPTION_KEY, `speech:${value.provider}`)
  const lang = providerLanguage(value.provider, language)
  const signal = AbortSignal.timeout(60_000)
  const fail = async (res: Response) => {
    if (res.status === 401 || res.status === 403) throw new SettingsError(`${speechProvider(value.provider)?.name} rejected the API key. Check it in Integrations.`)
    throw new SettingsError(`${speechProvider(value.provider)?.name} returned HTTP ${res.status}. Check the model and key in Integrations.`)
  }

  if (value.provider === "google") {
    const res = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${encodeURIComponent(apiKey)}`, {
      method: "POST", signal, redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: { encoding: "LINEAR16", sampleRateHertz: 16_000, languageCode: lang ?? "en-US", model: value.model, enableAutomaticPunctuation: true }, audio: { content: Buffer.from(wav).toString("base64") } }),
    })
    if (!res.ok) await fail(res)
    const data = await res.json() as { results?: { alternatives?: { transcript?: string }[] }[] }
    return (data.results ?? []).map((result) => result.alternatives?.[0]?.transcript ?? "").join(" ").trim()
  }

  if (value.provider === "deepgram") {
    const query = new URLSearchParams({ model: value.model, smart_format: "true", ...(lang ? { language: lang } : { detect_language: "true" }) })
    const res = await fetch(`https://api.deepgram.com/v1/listen?${query}`, { method: "POST", signal, redirect: "error", headers: { authorization: `Token ${apiKey}`, "content-type": "audio/wav" }, body: Buffer.from(wav) })
    if (!res.ok) await fail(res)
    const data = await res.json() as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } }
    return data.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? ""
  }

  // OpenAI and Groq share the same transcription API.
  const base = value.provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1"
  const form = new FormData()
  form.append("file", new Blob([Buffer.from(wav)], { type: "audio/wav" }), "dictation.wav")
  form.append("model", value.model)
  if (lang) form.append("language", lang)
  const res = await fetch(`${base}/audio/transcriptions`, { method: "POST", signal, redirect: "error", headers: { authorization: `Bearer ${apiKey}` }, body: form })
  if (!res.ok) await fail(res)
  const data = await res.json() as { text?: string }
  return data.text?.trim() ?? ""
}

/** Half a second of silence: proves the key, model and endpoint work. */
export async function testSpeech() {
  const samples = 8_000
  const wav = new Uint8Array(44 + samples * 2)
  const view = new DataView(wav.buffer)
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
  text(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); text(8, "WAVE"); text(12, "fmt ")
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16_000, true)
  view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, samples * 2, true)
  try {
    await transcribeSpeech(wav, "en")
    return { ok: true as const, message: "Connected. Dictation will use this provider." }
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "The test failed." }
  }
}
