"use client"

/**
 * Local Whisper: speech to text on this device. The choice lives in this browser
 * (the model is downloaded and cached per browser), not on the server.
 */
export type DictationEngine = "browser" | "whisper"
export type WhisperModel = "tiny" | "base" | "small" | "custom"

/** Built-in choices are all multilingual Whisper (so French, Arabic… work). "custom" is any transformers.js ASR model on Hugging Face. */
export const WHISPER_MODELS: Record<Exclude<WhisperModel, "custom">, { id: string; label: string; size: string; note: string }> = {
  tiny: { id: "onnx-community/whisper-tiny", label: "Fast", size: "about 40 MB", note: "Quick on any laptop. Good for clear speech." },
  base: { id: "onnx-community/whisper-base", label: "Accurate", size: "about 80 MB", note: "Better with accents and noise. A bit slower." },
  small: { id: "onnx-community/whisper-small", label: "Best", size: "about 250 MB", note: "Clearly better for French, Arabic and mixed speech. Needs a recent laptop." },
}

/** Spoken language. Whisper has no separate Darija: it uses Arabic, which handles it partly; a Darija-tuned custom model does better. */
export const DICTATION_LANGUAGES = [
  { value: "auto", label: "Detect automatically", whisper: undefined },
  { value: "en", label: "English", whisper: "en" },
  { value: "fr", label: "French", whisper: "fr" },
  { value: "ar", label: "Arabic", whisper: "ar" },
  { value: "ary", label: "Moroccan Darija", whisper: "ar" },
  { value: "es", label: "Spanish", whisper: "es" },
  { value: "de", label: "German", whisper: "de" },
  { value: "it", label: "Italian", whisper: "it" },
  { value: "pt", label: "Portuguese", whisper: "pt" },
  { value: "nl", label: "Dutch", whisper: "nl" },
  { value: "tr", label: "Turkish", whisper: "tr" },
] as const
export type DictationLanguage = (typeof DICTATION_LANGUAGES)[number]["value"]

/** "owner/name" as on huggingface.co; nothing else is accepted. */
export const validModelId = (id: string) => /^[\w.-]{1,96}\/[\w.-]{1,96}$/.test(id.trim())
export const modelId = (prefs: Prefs) => prefs.model === "custom" ? prefs.customModel.trim() : WHISPER_MODELS[prefs.model].id

const KEY = "naruvi-dictation"
type Prefs = { engine: DictationEngine; model: WhisperModel; customModel: string; language: DictationLanguage }
const DEFAULT: Prefs = { engine: "browser", model: "tiny", customModel: "", language: "auto" }
const listeners = new Set<() => void>()
let cached: Prefs | null = null

export function dictationPrefs(): Prefs {
  if (cached) return cached
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null
    const model = raw?.model === "base" || raw?.model === "small" || raw?.model === "custom" ? raw.model : "tiny"
    const customModel = typeof raw?.customModel === "string" && validModelId(raw.customModel) ? raw.customModel : ""
    cached = {
      engine: raw?.engine === "whisper" ? "whisper" : "browser",
      model: model === "custom" && !customModel ? "tiny" : model,
      customModel,
      language: DICTATION_LANGUAGES.some((item) => item.value === raw?.language) ? raw!.language! : "auto",
    }
  } catch {
    cached = DEFAULT
  }
  return cached
}
export const serverPrefs = () => DEFAULT
export function setDictationPrefs(next: Partial<Prefs>) {
  cached = { ...dictationPrefs(), ...next }
  try { localStorage.setItem(KEY, JSON.stringify(cached)) } catch { /* private mode: keeps working for this tab */ }
  for (const listener of listeners) listener()
}
export function subscribePrefs(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) { cached = null; listener() } }
  window.addEventListener("storage", onStorage)
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage) }
}

/* ── worker ── */

type Progress = (loaded: number, total: number) => void
let worker: Worker | null = null
let nextId = 0
/** Unload the model after this long without dictation; the next use reloads it from the browser cache. */
const IDLE_MS = 2 * 60_000
let idleTimer: ReturnType<typeof setTimeout> | undefined
function scheduleUnload() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (pending.size) return scheduleUnload() // still working: check again later
    worker?.terminate() // frees the model's memory (the whole worker heap)
    worker = null
  }, IDLE_MS)
}
const pending = new Map<number, { resolve: (value: string) => void; reject: (error: Error) => void; progress?: Progress; files: Map<string, [number, number]> }>()

function ensureWorker() {
  if (worker) return worker
  worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" })
  worker.onmessage = (event: MessageEvent<{ id: number; type: string; text?: string; message?: string; file?: string; loaded?: number; total?: number }>) => {
    const job = pending.get(event.data.id)
    if (!job) return
    if (event.data.type === "progress") {
      job.files.set(event.data.file ?? "", [event.data.loaded ?? 0, event.data.total ?? 0])
      let loaded = 0, total = 0
      for (const [l, t] of job.files.values()) { loaded += l; total += t }
      job.progress?.(loaded, total)
      return
    }
    pending.delete(event.data.id)
    scheduleUnload()
    if (event.data.type === "error") job.reject(new Error(event.data.message || "Whisper failed"))
    else job.resolve(event.data.text ?? "")
  }
  worker.onerror = () => {
    for (const job of pending.values()) job.reject(new Error("Whisper couldn’t start in this browser."))
    pending.clear()
    worker = null
  }
  return worker
}

function send(message: { type: "load" | "transcribe"; model: string; audio?: Float32Array; language?: string }, progress?: Progress) {
  const id = ++nextId
  return new Promise<string>((resolve, reject) => {
    clearTimeout(idleTimer)
    pending.set(id, { resolve, reject, progress, files: new Map() })
    ensureWorker().postMessage({ id, ...message }, message.audio ? [message.audio.buffer] : [])
  })
}

/** Downloads (first time) and warms up the model. */
export const loadWhisper = (model: string, progress?: Progress) => send({ type: "load", model }, progress).then(() => undefined)

/** Whisper wants 16 kHz mono. */
async function toPcm(blob: Blob) {
  const context = new AudioContext({ sampleRate: 16_000 })
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    if (decoded.numberOfChannels === 1) return decoded.getChannelData(0)
    const mono = new Float32Array(decoded.length)
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel)
      for (let i = 0; i < data.length; i += 1) mono[i] += data[i] / decoded.numberOfChannels
    }
    return mono
  } finally {
    void context.close().catch(() => {})
  }
}

export async function transcribe(blob: Blob, model: string, language: DictationLanguage, progress?: Progress) {
  const audio = await toPcm(blob)
  if (audio.length < 16_000 * 0.4) return "" // under ~0.4 s: nothing worth sending
  const whisper = DICTATION_LANGUAGES.find((item) => item.value === language)?.whisper
  return send({ type: "transcribe", model, audio, language: whisper }, progress)
}
