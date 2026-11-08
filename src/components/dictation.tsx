"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Loader2Icon, MicIcon } from "lucide-react"
import { dictationPrefs, modelId, serverPrefs, subscribePrefs, transcribe, transcribeCloud } from "@/lib/whisper/client"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionConstructor = new () => Recognition

const recognitionClass = (): RecognitionConstructor | null => {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const subscribe = () => () => {}

/** Plain-language fixes for each way dictation can fail. */
const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone is blocked. Allow it from the icon in the address bar, then try again.",
  "service-not-allowed": "This browser has speech recognition turned off.",
  "audio-capture": "No microphone found. Plug one in or check your sound settings.",
  network: "Dictation needs an internet connection in this browser.",
  "language-not-supported": "This language isn’t supported for dictation here.",
}

/** Asks for the microphone first, so the browser shows its normal prompt and we know why it failed. */
async function requestMicrophone(): Promise<{ stream: MediaStream | null; error: string | null }> {
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, error: null }
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }), error: null }
  } catch (error) {
    const name = error instanceof DOMException ? error.name : ""
    if (name === "NotAllowedError" || name === "SecurityError") return { stream: null, error: "not-allowed" }
    if (name === "NotFoundError" || name === "NotReadableError") return { stream: null, error: "audio-capture" }
    return { stream: null, error: null }
  }
}

/** Live input level (0–1) from the microphone stream, written straight to CSS so it never re-renders React. */
function meter(stream: MediaStream, target: () => HTMLElement | null) {
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return () => {}
  const context = new AudioCtx()
  const analyser = context.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.6
  context.createMediaStreamSource(stream).connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)
  let frame = 0
  let level = 0
  const tick = () => {
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (const value of data) sum += ((value - 128) / 128) ** 2
    // RMS → a gentle 0..1 curve; rises fast, falls slow so bars don't flicker.
    const next = Math.min(1, Math.sqrt(sum / data.length) * 4.5)
    level = next > level ? next : level * 0.88 + next * 0.12
    target()?.style.setProperty("--level", level.toFixed(3))
    frame = requestAnimationFrame(tick)
  }
  tick()
  return () => { cancelAnimationFrame(frame); void context.close().catch(() => {}) }
}

/**
 * Speak instead of typing. Uses the browser's own speech recognition (Chrome,
 * Edge, Safari); finished phrases are appended as you talk, with a live
 * preview of what is being heard.
 */
export function useDictation(onText: (text: string) => void, lang?: string) {
  const prefs = useSyncExternalStore(subscribePrefs, dictationPrefs, serverPrefs)
  // Whisper and cloud both record a clip and transcribe it when you stop.
  const whisper = prefs.engine === "whisper" || prefs.engine === "cloud"
  const cloud = prefs.engine === "cloud"
  const supported = useSyncExternalStore(subscribe, () => (dictationPrefs().engine !== "browser" ? typeof MediaRecorder !== "undefined" : recognitionClass() !== null), () => false)
  // Local Whisper only: after you stop, the clip is transcribed on this device (first use downloads the model).
  const [transcribing, setTranscribing] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [error, setError] = useState("")
  const recognition = useRef<Recognition | null>(null)
  // True while you want to keep dictating; browsers end a session after a pause, so we quietly restart it.
  const wanted = useRef(false)
  const stream = useRef<MediaStream | null>(null)
  const stopMeter = useRef<() => void>(() => {})
  const levelTarget = useRef<HTMLElement | null>(null)
  const release = useCallback(() => {
    stopMeter.current()
    stopMeter.current = () => {}
    for (const track of stream.current?.getTracks() ?? []) track.stop()
    stream.current = null
  }, [])
  const append = useRef(onText)
  useEffect(() => {
    append.current = onText
  }, [onText])

  const stop = useCallback(() => { wanted.current = false; recognition.current?.stop(); if (recorder.current?.state === "recording") recorder.current.stop() }, [])
  const start = useCallback(async () => {
    const Ctor = whisper ? null : recognitionClass()
    if (!whisper && !Ctor) return
    setError("")
    setListening(true)
    const mic = await requestMicrophone()
    if (mic.error) { setListening(false); setError(ERRORS[mic.error]); return }
    if (mic.stream) { stream.current = mic.stream; stopMeter.current = meter(mic.stream, () => levelTarget.current) }
    if (whisper) {
      if (!mic.stream) { setListening(false); setError("This browser can’t record audio."); return }
      const chunks: Blob[] = []
      const rec = new MediaRecorder(mic.stream)
      rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      rec.onstop = async () => {
        release()
        setListening(false)
        const blob = new Blob(chunks, { type: rec.mimeType })
        setTranscribing("Transcribing…")
        try {
          const text = cloud ? await transcribeCloud(blob, prefs.language) : await transcribe(blob, modelId(prefs), prefs.language, (loaded, total) => setTranscribing(total ? `Getting Whisper ready ${Math.round((loaded / total) * 100)}%` : "Getting Whisper ready…"))
          if (text) append.current(text)
          else setError("I didn’t catch anything. Try speaking a little longer.")
        } catch (failure) {
          if (cloud) { setError(failure instanceof Error ? failure.message : "Transcription failed. Try again."); return }
          setError(failure instanceof Error && /fetch|network/i.test(failure.message) ? "Couldn’t download the Whisper model. Check your connection." : "Local Whisper couldn’t transcribe that. Try again, or switch to browser dictation in Integrations.")
        } finally {
          setTranscribing(null)
          recorder.current = null
        }
      }
      recorder.current = rec
      rec.start()
      return
    }
    if (!Ctor) return
    wanted.current = true
    const instance = new Ctor()
    instance.lang = lang || navigator.language || "en-US"
    instance.continuous = true
    instance.interimResults = true
    instance.onresult = (event) => {
      let heard = ""
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) append.current(result[0].transcript.trim())
        else heard += result[0].transcript
      }
      setInterim(heard.trim())
    }
    instance.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return
      wanted.current = false
      setError(ERRORS[event.error] ?? "Dictation stopped. Try again.")
    }
    instance.onend = () => {
      setInterim("")
      if (wanted.current) {
        try { instance.start(); return } catch { /* fall through and stop */ }
      }
      wanted.current = false
      release()
      setListening(false)
    }
    recognition.current = instance
    try { instance.start() } catch { wanted.current = false; release(); setListening(false); setError("Dictation couldn’t start. Try again.") }
  }, [lang, release, whisper, cloud, prefs])
  useEffect(() => () => { wanted.current = false; recognition.current?.abort(); if (recorder.current?.state === "recording") recorder.current.stop(); release() }, [release])
  // Callback ref for the element that shows the level (the hook owns the ref).
  const bindLevel = useCallback((node: HTMLElement | null) => { levelTarget.current = node }, [])
  return { supported, listening, interim, error, start, stop, bindLevel, transcribing, whisper, cloud }
}

/** A microphone toggle for a text field. Appends what you say to `value`. */
export function DictateButton({ value, onChange, lang, className }: { value: string; onChange: (value: string) => void; lang?: string; className?: string }) {
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  const reduced = useReducedMotion()
  const { supported, listening, interim, error, start, stop, bindLevel, transcribing, whisper, cloud } = useDictation((text) => {
    const current = latest.current
    const next = `${current}${current && !/\s$/.test(current) ? " " : ""}${text}`
    latest.current = next
    onChange(next)
  }, lang)

  const swap = reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, scale: 0.6, filter: "blur(2px)" }, animate: { opacity: 1, scale: 1, filter: "blur(0px)" }, exit: { opacity: 0, scale: 0.6, filter: "blur(2px)" } }
  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!supported || Boolean(transcribing)}
      onClick={listening ? stop : () => void start()}
      aria-pressed={listening}
      aria-label={listening ? "Stop dictating" : "Dictate"}
      ref={bindLevel}
      className={cn(
        "relative gap-1.5 overflow-visible transition-[background-color,border-color,color,box-shadow] duration-200",
        // Listening: copper, with a soft halo that swells with your voice (--level, 0–1, set per frame).
        listening && "border-brand/40 bg-brand-soft text-brand shadow-[0_0_0_calc(var(--level,0)*6px)_color-mix(in_oklab,var(--brand)_18%,transparent)] hover:bg-brand-soft hover:text-brand",
        className,
      )}
    >
      <span className="relative grid size-4 place-content-center">
        <AnimatePresence initial={false} mode="popLayout">
          {transcribing ? (
            <motion.span key="busy" {...swap} transition={{ duration: 0.18 }} className="grid place-content-center"><Loader2Icon className="size-4 animate-spin" /></motion.span>
          ) : listening ? (
            <motion.span key="bars" {...swap} transition={{ duration: 0.18 }} className="flex h-3.5 items-center gap-[2px]" aria-hidden>
              {[0.55, 1, 0.75, 0.45].map((weight, index) => (
                <span key={index} className="w-[2.5px] rounded-full bg-current transition-[height] duration-75"
                  style={{ height: `calc(3px + var(--level, 0) * ${weight * 11}px)` }} />
              ))}
            </motion.span>
          ) : (
            <motion.span key="mic" {...swap} transition={{ duration: 0.18 }} className="grid place-content-center"><MicIcon className="size-4" /></motion.span>
          )}
        </AnimatePresence>
      </span>
      <AnimatePresence initial={false} mode="wait">
        <motion.span key={transcribing ?? (listening ? "stop" : "dictate")} initial={{ opacity: 0, y: reduced ? 0 : 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -3 }} transition={{ duration: 0.12 }}>
          {transcribing ?? (listening ? (whisper ? "Recording… tap when done" : "Listening… tap to stop") : "Dictate")}
        </motion.span>
      </AnimatePresence>
    </Button>
  )

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {supported ? (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent className="max-w-64">{cloud ? "Speak, then tap again. The clip goes to the speech provider you connected in Integrations." : whisper ? "Speak, then tap again. Whisper turns it into text on this device: your audio never leaves your computer." : "Speak naturally; your words appear as you talk. Your browser’s speech service turns audio into text (in Chrome that’s Google). Prefer on-device? Choose local Whisper in Integrations."}</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0}>{button}</span>} />
          <TooltipContent>{whisper ? "This browser can’t record audio." : "Browser dictation needs Chrome, Edge or Safari. Local Whisper in Integrations works in Firefox too."}</TooltipContent>
        </Tooltip>
      )}
      {listening && interim ? <span className="truncate text-xs text-muted-foreground italic" aria-live="polite">{interim}…</span> : null}
      {error && !listening ? <span role="alert" className="min-w-0 text-xs text-pretty text-destructive">{error}</span> : null}
    </span>
  )
}
