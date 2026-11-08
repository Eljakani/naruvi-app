"use client"

import Image from "next/image"
import { useState, useSyncExternalStore, useTransition } from "react"
import { AnimatePresence, motion } from "motion/react"
import { CheckIcon, CloudIcon, DownloadIcon, ExternalLinkIcon, GlobeIcon, LaptopIcon, Loader2Icon, PlugZapIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { saveSpeechSettingsAction, testSpeechAction } from "@/app/(app)/settings/actions"
import { GoogleLogo, MicrosoftLogo } from "@/components/brand-logos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SPEECH_PROVIDERS, speechProvider, type SpeechProviderId } from "@/lib/speech-providers"
import { cn } from "@/lib/utils"
import { DICTATION_LANGUAGES, dictationPrefs, loadWhisper, modelId, serverPrefs, setDictationPrefs, subscribePrefs, validModelId, WHISPER_MODELS, type DictationEngine, type DictationLanguage, type WhisperModel } from "@/lib/whisper/client"
import type { SpeechOverview } from "@/server/settings/speech"

const Logo = ({ src, className }: { src: string; className?: string }) => <Image src={src} alt="" aria-hidden width={16} height={16} unoptimized className={cn("size-4 shrink-0 object-contain", className)} />

const ENGINES: { value: DictationEngine; title: string; body: string; icon: LucideIcon; tags: string[]; marks: React.ReactNode }[] = [
  { value: "whisper", title: "On this computer", body: "Whisper runs in your browser. Your audio never leaves your computer.", icon: LaptopIcon, tags: ["Private", "Free"],
    marks: <><Logo src="/provider-logos/openai.svg" className="size-3.5 dark:invert" /><Logo src="/provider-logos/huggingface-color.svg" /></> },
  { value: "cloud", title: "Speech API", body: "Google, OpenAI, Groq or Deepgram with your own key. Most accurate; the clip goes to that provider.", icon: CloudIcon, tags: ["Your key"],
    marks: <><GoogleLogo className="size-3.5" /><Logo src="/provider-logos/openai.svg" className="size-3.5 dark:invert" /><Logo src="/provider-logos/groq.svg" className="size-3.5 dark:invert" /></> },
  { value: "browser", title: "Browser", body: "Words appear as you speak. Chrome sends audio to Google, Edge to Microsoft. Not in Firefox.", icon: GlobeIcon, tags: ["Live text"],
    marks: <><GoogleLogo className="size-3.5" /><MicrosoftLogo className="size-3" /></> },
]

const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] as const } }

/** How your voice becomes text. The engine is chosen per browser; a speech API key is stored encrypted on the server. */
export function DictationSettings({ speech }: { speech: SpeechOverview }) {
  const prefs = useSyncExternalStore(subscribePrefs, dictationPrefs, serverPrefs)
  return (
    <Card>
      <CardHeader>
        <CardTitle><h3>Dictation</h3></CardTitle>
        <CardDescription>How your voice becomes text when you press Dictate. The choice is saved for this browser.</CardDescription>
        <CardAction>{prefs.engine === "cloud" && !speech.configured ? <Badge variant="outline">Needs a key</Badge> : <Badge variant="secondary">{ENGINES.find((e) => e.value === prefs.engine)?.title}</Badge>}</CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid divide-y overflow-hidden rounded-xl border" role="radiogroup" aria-label="Dictation engine">
          {ENGINES.map(({ value, title, body, icon: Icon, tags, marks }) => {
            const active = prefs.engine === value
            return (
              <button key={value} type="button" role="radio" aria-checked={active} onClick={() => setDictationPrefs({ engine: value })}
                className={cn("flex items-start gap-3 px-3.5 py-3 text-start transition-colors focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring", active ? "bg-brand-soft/40" : "hover:bg-muted/40")}>
                <span className={cn("mt-0.5 grid size-4 shrink-0 place-content-center rounded-full border transition-colors", active ? "border-brand bg-brand" : "border-muted-foreground/40")}>
                  {active ? <span className="size-1.5 rounded-full bg-brand-foreground" /> : null}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                    <Icon className={cn("size-4", active ? "text-brand" : "text-muted-foreground")} /> {title}
                    {tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-1.5 text-[11px] leading-4 font-normal text-muted-foreground">{tag}</span>)}
                  </span>
                  <span className="text-xs text-pretty text-muted-foreground">{body}</span>
                </span>
                <span className="mt-0.5 flex shrink-0 items-center gap-1">{marks}</span>
              </button>
            )
          })}
        </div>

        {prefs.engine !== "browser" ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-medium">Language you speak</p>
              <p className="text-xs text-pretty text-muted-foreground">
                {prefs.language === "ary" ? (prefs.engine === "cloud" ? "Google understands Moroccan Arabic (ar-MA); the others use Arabic." : "Whisper uses Arabic for Darija. A Darija-tuned model does better.") : "Picking it is more accurate than detecting, especially for short clips."}
              </p>
            </div>
            <Select items={DICTATION_LANGUAGES.map((item) => ({ value: item.value, label: item.label }))} value={prefs.language} onValueChange={(value) => value && setDictationPrefs({ language: value as DictationLanguage })}>
              <SelectTrigger className="w-52" aria-label="Language you speak"><SelectValue /></SelectTrigger>
              <SelectContent>{DICTATION_LANGUAGES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : null}

        <AnimatePresence initial={false} mode="wait">
          {prefs.engine === "whisper" ? <motion.div key="whisper" {...reveal} className="overflow-hidden"><WhisperOptions /></motion.div> : null}
          {prefs.engine === "cloud" ? <motion.div key="cloud" {...reveal} className="overflow-hidden"><CloudOptions initial={speech} /></motion.div> : null}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

/* ── on this computer ── */

function WhisperOptions() {
  const prefs = useSyncExternalStore(subscribePrefs, dictationPrefs, serverPrefs)
  const [download, setDownload] = useState<number | null | undefined>(undefined)
  const [ready, setReady] = useState<string | null>(null)
  const [custom, setCustom] = useState(prefs.customModel)
  const customValid = validModelId(custom)
  const current = modelId(prefs)
  const options: { value: WhisperModel; label: string; size: string; note: string }[] = [
    ...(Object.keys(WHISPER_MODELS) as (keyof typeof WHISPER_MODELS)[]).map((key) => ({ value: key as WhisperModel, ...WHISPER_MODELS[key] })),
    { value: "custom", label: "Your own", size: "Hugging Face", note: "Any speech model with transformers.js files." },
  ]
  const prepare = async () => {
    setDownload(null)
    try {
      await loadWhisper(current, (loaded, total) => setDownload(total ? Math.round((loaded / total) * 100) : null))
      setReady(current)
      toast.success("Whisper is ready", { description: "Dictation now runs on this computer." })
    } catch (error) {
      const network = error instanceof Error && /fetch|network/i.test(error.message)
      toast.error(prefs.model === "custom" && !network ? "That model didn’t load" : "Couldn’t download the model", { description: prefs.model === "custom" && !network ? "Use a speech-recognition model with ONNX files for transformers.js (e.g. from onnx-community)." : "Check your connection and try again." })
    } finally {
      setDownload(undefined)
    }
  }
  return (
    <div className="grid gap-3 border-t pt-4">
      <p className="text-sm font-medium">Model</p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Whisper model">
        {options.map((option) => {
          const active = prefs.model === option.value
          return (
            <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => setDictationPrefs({ model: option.value })}
              className={cn("grid gap-0.5 rounded-lg border p-2.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-ring", active ? "border-brand/50 bg-brand-soft/30 ring-1 ring-brand/20" : "hover:bg-muted/40")}>
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                <span className="flex items-center gap-1.5">{option.value === "custom" ? <Logo src="/provider-logos/huggingface-color.svg" /> : <Logo src="/provider-logos/openai.svg" className="size-3.5 opacity-70 dark:invert" />}{option.label}</span>
                <span className="text-xs font-normal text-muted-foreground">{option.size}</span>
              </span>
              <span className="text-xs text-pretty text-muted-foreground">{option.note}</span>
            </button>
          )
        })}
      </div>
      {prefs.model === "custom" ? (
        <form className="grid gap-1.5" onSubmit={(event) => { event.preventDefault(); if (customValid) setDictationPrefs({ model: "custom", customModel: custom.trim() }) }}>
          <div className="flex gap-1.5">
            <Input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="owner/model-name" aria-label="Hugging Face model ID" aria-invalid={custom.trim() !== "" && !customValid} className="font-mono text-xs" spellCheck={false} autoCapitalize="none" />
            <Button type="submit" variant="outline" disabled={!customValid}>{prefs.customModel === custom.trim() && customValid ? <CheckIcon /> : null} Use</Button>
          </div>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {custom.trim() && !customValid ? "Use the ID as on Hugging Face, like onnx-community/whisper-large-v3-turbo." : "Find models that run in the browser:"}
            <a href="https://huggingface.co/models?pipeline_tag=automatic-speech-recognition&library=transformers.js&sort=downloads" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground">Browse on Hugging Face <ExternalLinkIcon className="size-3" /></a>
          </span>
        </form>
      ) : null}
      {download !== undefined ? (
        <div className="grid gap-1.5" role="status">
          <span className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2Icon className="size-3.5 animate-spin" /> Downloading {current}{download !== null ? ` · ${download}%` : "…"}</span>
          <Progress value={download ?? 5} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button size="sm" variant="outline" disabled={!current} onClick={() => void prepare()}>
            {ready === current ? <CheckIcon className="text-emerald-600" /> : <DownloadIcon />} {ready === current ? "Ready" : "Download now"}
          </Button>
          <span className="text-xs text-pretty text-muted-foreground">Optional. Otherwise it downloads the first time you dictate, then stays cached.</span>
        </div>
      )}
    </div>
  )
}

/* ── speech API ── */

function CloudOptions({ initial }: { initial: SpeechOverview }) {
  const [overview, setOverview] = useState(initial)
  const [provider, setProvider] = useState<SpeechProviderId>(initial.provider ?? "google")
  const info = speechProvider(provider)!
  const [model, setModel] = useState<string>(initial.provider === provider && initial.model ? initial.model : info.models[0])
  const [apiKey, setApiKey] = useState("")
  const [pending, start] = useTransition()
  const [testing, startTest] = useTransition()
  const savedHere = overview.provider === provider && overview.hasKey
  const dirty = apiKey.trim() !== "" || overview.provider !== provider || overview.model !== model

  const choose = (id: SpeechProviderId) => {
    setProvider(id)
    setModel(overview.provider === id && overview.model ? overview.model : speechProvider(id)!.models[0])
  }
  const save = () => start(async () => {
    const result = await saveSpeechSettingsAction({ provider, model, apiKey })
    if (!result.ok) return void toast.error(result.message)
    setOverview(result.overview)
    setApiKey("")
    toast.success(`${info.name} saved`, { description: result.overview.configured ? "Test it, or just press Dictate." : "Add an API key to use it." })
  })
  const test = () => startTest(async () => {
    const result = await testSpeechAction()
    if (result.ok) toast.success(result.message ?? "Connected")
    else toast.error(result.message)
  })

  return (
    <div className="grid gap-4 border-t pt-4">
      <div className="grid gap-2">
        <p className="text-sm font-medium">Provider</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Speech provider">
          {SPEECH_PROVIDERS.map((item) => {
            const active = provider === item.id
            const connected = overview.provider === item.id && overview.configured
            return (
              <button key={item.id} type="button" role="radio" aria-checked={active} onClick={() => choose(item.id)}
                className={cn("relative grid justify-items-start gap-1.5 rounded-lg border p-2.5 text-start text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring", active ? "border-brand/50 bg-brand-soft/30 ring-1 ring-brand/20" : "hover:bg-muted/40")}>
                {item.id === "google" ? <GoogleLogo className="size-5" /> : item.logo ? <Logo src={item.logo} className={cn("size-5", item.logo.endsWith("-color.svg") ? "" : "dark:invert")} /> : <PlugZapIcon className="size-5 text-muted-foreground" />}
                <span className="leading-tight">{item.name}</span>
                {connected ? <span className="absolute top-2 right-2 size-1.5 rounded-full bg-emerald-500" title="Connected" /> : null}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-pretty text-muted-foreground">{info.note}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="grid content-start gap-1.5">
          <label className="text-sm font-medium" htmlFor="speech-model">Model</label>
          <Select items={info.models.map((value) => ({ value, label: value }))} value={model} onValueChange={(value) => value && setModel(value)}>
            <SelectTrigger id="speech-model" className="w-full font-mono text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{info.models.map((value) => <SelectItem key={value} value={value} className="font-mono text-xs">{value}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid content-start gap-1.5">
          <label className="text-sm font-medium" htmlFor="speech-key">API key</label>
          <Input id="speech-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={savedHere ? "Saved. Leave blank to keep it" : `Paste your ${info.name} key`} />
          <a href={info.help} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">Get a {info.name.split(" ")[0]} key <ExternalLinkIcon className="size-3" /></a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" onClick={save} disabled={pending || !dirty || (!savedHere && !apiKey.trim())}>{pending ? <Loader2Icon className="animate-spin" /> : null} Save</Button>
        <Button size="sm" variant="outline" onClick={test} disabled={testing || !overview.configured || dirty}><PlugZapIcon className={testing ? "cb-breathe" : undefined} /> Test</Button>
        <span className="ms-auto text-xs text-muted-foreground">
          {overview.configured && overview.provider ? <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" /> {speechProvider(overview.provider)?.name} · {overview.model}</span> : "Keys are stored encrypted on this server."}
        </span>
      </div>
    </div>
  )
}
