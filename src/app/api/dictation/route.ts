import { transcribeSpeech } from "@/server/settings/speech"
import { SettingsError } from "@/server/settings/errors"

const MAX_BYTES = 10 * 1024 * 1024 // ~5 minutes of 16 kHz mono WAV
const LANGUAGES = new Set(["auto", "en", "fr", "ar", "ary", "es", "de", "it", "pt", "nl", "tr"])

/** Cloud dictation: WAV from the browser → the speech provider you connected. Session and same-origin are enforced by the proxy. */
export async function POST(request: Request) {
  if (request.headers.get("content-type") !== "audio/wav") return Response.json({ error: "Send audio/wav." }, { status: 415 })
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return Response.json({ error: "That recording is too long. Keep it under five minutes." }, { status: 413 })
  const language = new URL(request.url).searchParams.get("language") ?? "auto"
  if (!LANGUAGES.has(language)) return Response.json({ error: "Unknown language." }, { status: 400 })
  const audio = new Uint8Array(await request.arrayBuffer())
  if (audio.byteLength > MAX_BYTES) return Response.json({ error: "That recording is too long. Keep it under five minutes." }, { status: 413 })
  if (audio.byteLength < 44 || String.fromCharCode(...audio.slice(0, 4)) !== "RIFF") return Response.json({ error: "Invalid audio." }, { status: 400 })
  try {
    return Response.json({ text: await transcribeSpeech(audio, language) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    return Response.json({ error: error instanceof SettingsError ? error.message : "Transcription failed. Try again." }, { status: error instanceof SettingsError ? 400 : 502 })
  }
}
