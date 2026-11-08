"use client"

import { useState, useSyncExternalStore } from "react"
import { CheckIcon, CloudIcon, DownloadIcon, ExternalLinkIcon, LaptopIcon, Loader2Icon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { GoogleLogo, MicrosoftLogo } from "@/components/brand-logos"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { DICTATION_LANGUAGES, dictationPrefs, loadWhisper, modelId, serverPrefs, setDictationPrefs, subscribePrefs, validModelId, WHISPER_MODELS, type DictationEngine, type DictationLanguage } from "@/lib/whisper/client"

const ENGINES: { value: DictationEngine; title: string; body: string; icon: typeof CloudIcon }[] = [
  { value: "browser", title: "Browser", body: "Words appear as you talk. Chrome sends the audio to Google, Edge to Microsoft. Not in Firefox.", icon: CloudIcon },
  { value: "whisper", title: "Local Whisper", body: "Runs on this computer: your audio never leaves it. Transcribes when you stop. Works in every modern browser.", icon: LaptopIcon },
]

/* eslint-disable @next/next/no-img-element -- tiny static brand marks */
const Mark = ({ src, className }: { src: string; className?: string }) => <img src={src} alt="" aria-hidden width={16} height={16} className={cn("size-4 shrink-0", className)} />
/** Who does the work, shown as their marks. */
const ENGINE_MARKS: Record<DictationEngine, React.ReactNode> = {
  browser: <span className="flex items-center gap-1" title="Google (Chrome) or Microsoft (Edge)"><GoogleLogo className="size-3.5" /><MicrosoftLogo className="size-3" /></span>,
  whisper: <span className="flex items-center gap-1" title="OpenAI Whisper, downloaded from Hugging Face"><Mark src="/provider-logos/openai.svg" className="size-3.5 dark:invert" /><Mark src="/provider-logos/huggingface-color.svg" /></span>,
}
/* eslint-enable @next/next/no-img-element */

/** Dictation engine for this browser. Stored per browser, since the Whisper model is downloaded per browser. */
export function DictationSettings() {
  const prefs = useSyncExternalStore(subscribePrefs, dictationPrefs, serverPrefs)
  const [download, setDownload] = useState<{ id: string; percent: number | null } | null>(null)
  const [ready, setReady] = useState<string | null>(null)
  const [custom, setCustom] = useState(prefs.customModel)
  const customValid = validModelId(custom)
  const current = modelId(prefs)

  const prepare = async (id: string) => {
    setDownload({ id, percent: null })
    try {
      await loadWhisper(id, (loaded, total) => setDownload({ id, percent: total ? Math.round((loaded / total) * 100) : null }))
      setReady(id)
      toast.success("Whisper is ready", { description: "Dictation now runs on this computer." })
    } catch (error) {
      const message = error instanceof Error ? error.message : ""
      toast.error(prefs.model === "custom" ? "That model didn’t load" : "Couldn’t download the Whisper model", {
        description: prefs.model === "custom" && !/fetch|network/i.test(message)
          ? "Use a speech-recognition model with ONNX files for transformers.js (e.g. from onnx-community)."
          : "Check your connection and try again.",
      })
    } finally {
      setDownload(null)
    }
  }
  const applyCustom = () => {
    if (!customValid) return
    setDictationPrefs({ model: "custom", customModel: custom.trim() })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><h3>Dictation</h3></CardTitle>
        <CardDescription>How your voice becomes text when you press Dictate. Saved for this browser.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Dictation engine">
          {ENGINES.map(({ value, title, body, icon: Icon }) => {
            const active = prefs.engine === value
            return (
              <button key={value} type="button" role="radio" aria-checked={active} onClick={() => setDictationPrefs({ engine: value })}
                className={cn("grid gap-1.5 rounded-xl border p-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-ring", active ? "border-brand/50 bg-brand-soft/40 ring-1 ring-brand/20" : "hover:bg-muted/50")}>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Icon className={cn("size-4", active ? "text-brand" : "text-muted-foreground")} /> {title}
                  <span className="ms-auto flex items-center gap-2">{ENGINE_MARKS[value]}{active ? <CheckIcon className="cb-pop size-4 text-brand" /> : null}</span>
                </span>
                <span className="text-xs text-pretty text-muted-foreground">{body}</span>
              </button>
            )
          })}
        </div>

        {prefs.engine === "whisper" ? (
          <div className="cb-step grid gap-3 rounded-xl border bg-muted/20 p-3">
            <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
              <div>
                <p className="text-sm font-medium">Language you speak</p>
                <p className="text-xs text-pretty text-muted-foreground">{prefs.language === "ary" ? "Darija uses Whisper’s Arabic. For better Darija, add a Darija-tuned model below." : "Picking it makes short clips more accurate than detecting."}</p>
              </div>
              <Select items={DICTATION_LANGUAGES.map((item) => ({ value: item.value, label: item.label }))} value={prefs.language} onValueChange={(value) => value && setDictationPrefs({ language: value as DictationLanguage })}>
                <SelectTrigger className="w-full" aria-label="Language you speak"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DICTATION_LANGUAGES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs font-medium text-muted-foreground">Model</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(WHISPER_MODELS) as (keyof typeof WHISPER_MODELS)[]).map((model) => {
                const info = WHISPER_MODELS[model]
                const active = prefs.model === model
                return (
                  <button key={model} type="button" onClick={() => setDictationPrefs({ model })} aria-pressed={active}
                    className={cn("grid gap-0.5 rounded-lg border bg-background p-2.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-ring", active ? "border-brand/50 ring-1 ring-brand/20" : "hover:bg-muted/50")}>
                    <span className="flex items-center justify-between gap-2 text-sm font-medium">
                      <span className="flex items-center gap-1.5"><Mark src="/provider-logos/openai.svg" className="size-3.5 opacity-70 dark:invert" />{info.label}</span>
                      <span className="text-xs font-normal text-muted-foreground">{info.size}</span>
                    </span>
                    <span className="text-xs text-pretty text-muted-foreground">{info.note}</span>
                  </button>
                )
              })}
              <div className={cn("grid gap-1.5 rounded-lg border bg-background p-2.5", prefs.model === "custom" && "border-brand/50 ring-1 ring-brand/20")}>
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span className="flex items-center gap-1.5"><Mark src="/provider-logos/huggingface-color.svg" />Your own model</span>
                  <a href="https://huggingface.co/models?pipeline_tag=automatic-speech-recognition&library=transformers.js&sort=downloads" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground">Browse <ExternalLinkIcon className="size-3" /></a>
                </span>
                <form className="flex gap-1.5" onSubmit={(event) => { event.preventDefault(); applyCustom() }}>
                  <Input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="owner/model-name" aria-label="Hugging Face model ID" aria-invalid={custom.trim() !== "" && !customValid} className="h-8 font-mono text-xs" spellCheck={false} autoCapitalize="none" />
                  <Button type="submit" size="sm" variant={prefs.model === "custom" && prefs.customModel === custom.trim() ? "secondary" : "outline"} disabled={!customValid}>
                    {prefs.model === "custom" && prefs.customModel === custom.trim() ? <CheckIcon /> : null} Use
                  </Button>
                </form>
                <span className="text-xs text-pretty text-muted-foreground">{custom.trim() && !customValid ? "Use the ID as on Hugging Face, like onnx-community/whisper-large-v3-turbo." : "Any speech-recognition model with transformers.js (ONNX) files."}</span>
              </div>
            </div>
            {download ? (
              <div className="grid gap-1.5" role="status">
                <span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2Icon className="size-3.5 animate-spin" /> Downloading {download.id}{download.percent !== null ? ` · ${download.percent}%` : "…"}</span>
                <Progress value={download.percent ?? 5} />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void prepare(current)}>
                  {ready === current ? <CheckIcon className="text-emerald-600" /> : <DownloadIcon />} {ready === current ? "Ready" : prefs.model === "custom" ? "Download and test" : "Download now"}
                </Button>
                <span className="text-xs text-pretty text-muted-foreground">Optional: otherwise it downloads the first time you dictate. Cached by your browser after that.</span>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
