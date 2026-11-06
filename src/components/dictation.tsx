"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { MicIcon, SquareIcon } from "lucide-react"
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

/**
 * Speak instead of typing. Uses the browser's own speech recognition (Chrome,
 * Edge, Safari); finished phrases are appended as you talk, with a live
 * preview of what is being heard.
 */
export function useDictation(onText: (text: string) => void, lang?: string) {
  const supported = useSyncExternalStore(subscribe, () => recognitionClass() !== null, () => false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [error, setError] = useState("")
  const recognition = useRef<Recognition | null>(null)
  const append = useRef(onText)
  useEffect(() => {
    append.current = onText
  }, [onText])

  const stop = useCallback(() => recognition.current?.stop(), [])
  const start = useCallback(() => {
    const Ctor = recognitionClass()
    if (!Ctor) return
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
    instance.onerror = (event) => setError(event.error === "not-allowed" ? "Microphone access was refused." : event.error === "no-speech" ? "" : "Dictation stopped.")
    instance.onend = () => {
      setListening(false)
      setInterim("")
    }
    recognition.current = instance
    setError("")
    setListening(true)
    instance.start()
  }, [lang])
  useEffect(() => () => recognition.current?.abort(), [])
  return { supported, listening, interim, error, start, stop }
}

/** A microphone toggle for a text field. Appends what you say to `value`. */
export function DictateButton({ value, onChange, lang, className }: { value: string; onChange: (value: string) => void; lang?: string; className?: string }) {
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  const { supported, listening, interim, error, start, stop } = useDictation((text) => {
    const current = latest.current
    const next = `${current}${current && !/\s$/.test(current) ? " " : ""}${text}`
    latest.current = next
    onChange(next)
  }, lang)

  const button = (
    <Button
      type="button"
      variant={listening ? "default" : "outline"}
      size="sm"
      disabled={!supported}
      onClick={listening ? stop : start}
      aria-pressed={listening}
      className={cn("relative", className)}
    >
      {listening ? <span className="absolute inset-0 animate-ping rounded-md bg-primary/20 motion-reduce:hidden" aria-hidden /> : null}
      {listening ? <SquareIcon /> : <MicIcon />} {listening ? "Stop" : "Dictate"}
    </Button>
  )

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {supported ? (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent className="max-w-64">Speak naturally; your words appear as you talk. Your browser’s speech service turns audio into text (in Chrome that’s Google).</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0}>{button}</span>} />
          <TooltipContent>Dictation needs Chrome, Edge or Safari.</TooltipContent>
        </Tooltip>
      )}
      {listening && interim ? <span className="truncate text-xs text-muted-foreground italic" aria-live="polite">{interim}…</span> : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  )
}
