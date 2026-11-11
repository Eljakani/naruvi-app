"use client"

import { useState, useTransition } from "react"
import { CheckIcon, ClipboardPasteIcon, GlobeIcon, ImageIcon, LinkIcon, Loader2Icon, ScanTextIcon, SparklesIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { previewJobAction, type Duplicate } from "@/app/[locale]/(app)/jobs/actions"
import { useStep } from "@/components/ai-progress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import type { JobDraft } from "@/server/jobs/schema"
import { useTranslations } from "next-intl"

export type ReadResult = { draft: JobDraft & { runId?: string }; duplicates: Duplicate[] }

const BOARDS = ["LinkedIn", "Greenhouse", "Lever", "Ashby", "Workday", "Welcome to the Jungle"]
const STEPS: { label: "fetch" | "read" | "website" | "logo" | "text"; icon: LucideIcon }[] = [
  { label: "fetch", icon: GlobeIcon },
  { label: "read", icon: ScanTextIcon },
  { label: "website", icon: LinkIcon },
  { label: "logo", icon: ImageIcon },
]
const TEXT_STEPS = [{ label: "text" as const, icon: ScanTextIcon }, ...STEPS.slice(1)]

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** Link or pasted text in, a draft out. Shows the posting being read while it works. */
export function JobReader({ onDone, initialUrl = "", initialText = "", autoFocus = true }: { onDone: (result: ReadResult, source: { url: string; mode: "link" | "text" }) => void; initialUrl?: string; initialText?: string; autoFocus?: boolean }) {
  const t = useTranslations("jobReader")
  const [mode, setMode] = useState<"link" | "text">(initialText ? "text" : "link")
  const [url, setUrl] = useState(initialUrl)
  const [text, setText] = useState(initialText)
  const [reading, startReading] = useTransition()
  const steps = mode === "link" ? STEPS : TEXT_STEPS
  const step = useStep(reading, steps.length)
  const ready = mode === "link" ? /^https?:\/\/\S+\.\S+/.test(url.trim()) : text.trim().length >= 80

  const read = () => {
    if (!ready || reading) return
    startReading(async () => {
      const result = await previewJobAction(mode === "link" ? { url: url.trim() } : { text })
      if (!result.ok) return void toast.error(t("failed"), { description: result.error })
      onDone(result.data, { url: url.trim(), mode })
    })
  }

  if (reading) return <ReadingPosting host={mode === "link" ? hostOf(url) : t("pastedText")} steps={steps} step={step} />

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        read()
      }}
    >
      <ToggleGroup aria-label={t("how")} variant="outline" size="sm" value={[mode]} onValueChange={(value) => value[0] && setMode(value[0] as "link" | "text")} className="w-fit">
        <ToggleGroupItem value="link">
          <LinkIcon /> {t("link")}
        </ToggleGroupItem>
        <ToggleGroupItem value="text">
          <ClipboardPasteIcon /> {t("paste")}
        </ToggleGroupItem>
      </ToggleGroup>
      {mode === "link" ? (
        <>
          <div className="flex gap-2">
            <Input
              autoFocus={autoFocus}
              type="url"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onPaste={(event) => {
                // Pasting a link is the whole job: read it right away.
                const pasted = event.clipboardData.getData("text").trim()
                if (/^https?:\/\/\S+\.\S+$/.test(pasted) && !url.trim()) {
                  event.preventDefault()
                  setUrl(pasted)
                  startReading(async () => {
                    const result = await previewJobAction({ url: pasted })
                    if (!result.ok) return void toast.error(t("failed"), { description: result.error })
                    onDone(result.data, { url: pasted, mode: "link" })
                  })
                }
              }}
              placeholder={t("linkPlaceholder")}
              aria-label={t("linkLabel")}
              className="h-10"
            />
            <Button type="submit" size="lg" disabled={!ready}>
              <SparklesIcon data-icon="inline-start" /> {t("read")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("worksWith", { boards: BOARDS.join(", ") })}
          </p>
        </>
      ) : (
        <>
          <Textarea autoFocus={autoFocus} value={text} onChange={(event) => setText(event.target.value)} rows={9} placeholder={t("textPlaceholder")} aria-label={t("textLabel")} className="max-h-[50vh]" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{text.trim().length < 80 ? t("more", { count: 80 - text.trim().length }) : t("chars", { count: text.trim().length })}</span>
            <Button type="submit" disabled={!ready}>
              <ScanTextIcon data-icon="inline-start" /> {t("readText")}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}

/** A posting being scanned: a page sketch with a moving read line, and the steps ticking off. */
function ReadingPosting({ host, steps, step }: { host: string; steps: typeof STEPS; step: number }) {
  const t = useTranslations("jobReader")
  return (
    <div role="status" aria-live="polite" className="cb-fade grid gap-5 sm:grid-cols-[11rem_1fr] sm:items-center">
      <div className="relative mx-auto aspect-[3/4] w-40 overflow-hidden rounded-lg border bg-background p-3 shadow-sm sm:w-full" aria-hidden>
        <div className="mb-2 flex items-center gap-1.5">
          <span className="size-4 rounded bg-muted" />
          <span className="h-2 flex-1 truncate rounded bg-muted text-[0px]">{host}</span>
        </div>
        <div className="grid gap-1.5">
          <span className="h-2.5 w-3/4 rounded bg-foreground/15" />
          <span className="h-1.5 w-1/2 rounded bg-muted" />
          {[92, 84, 96, 70, 88, 60, 94, 78, 66].map((width, index) => (
            <span key={index} className={cn("h-1.5 rounded bg-muted transition-colors duration-500", index < (step + 1) * 2.5 && "bg-primary/25")} style={{ width: `${width}%` }} />
          ))}
        </div>
        <span className="cb-scan pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-primary/15 to-transparent" />
      </div>
      <div className="grid gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("reading")}</p>
          <p className="truncate text-xs text-muted-foreground">{host}</p>
        </div>
        <ol className="grid gap-2">
          {steps.map((item, index) => {
            const done = index < step
            const current = index === step
            return (
              <li key={item.label} className={cn("flex items-center gap-2.5 text-sm transition-opacity duration-300", !done && !current && "opacity-40")}>
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-300", done && "border-primary bg-primary text-primary-foreground", current && "border-primary/40")}>
                  {done ? <CheckIcon className="cb-pop size-3.5" /> : current ? <Loader2Icon className="size-3.5 animate-spin text-primary" /> : <item.icon className="size-3.5" />}
                </span>
                <span className={cn(current && "cb-shimmer font-medium")}>{t(`steps.${item.label}`)}</span>
              </li>
            )
          })}
        </ol>
        <p className="text-xs text-muted-foreground">{t("nothingSaved")}</p>
      </div>
    </div>
  )
}
