"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactElement } from "react"
import { CheckIcon, ClipboardPasteIcon, GlobeIcon, ImageIcon, LinkIcon, Loader2Icon, ScanTextIcon, SparklesIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { previewJobAction, type Duplicate } from "@/app/(app)/jobs/actions"
import { useStep } from "@/components/ai-progress"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import type { JobDraft } from "@/server/jobs/schema"

export type ReadResult = { draft: JobDraft & { runId?: string }; duplicates: Duplicate[] }

const BOARDS = ["LinkedIn", "Greenhouse", "Lever", "Ashby", "Workday", "Welcome to the Jungle", "any careers page"]
const STEPS: { label: string; icon: LucideIcon }[] = [
  { label: "Fetching the posting", icon: GlobeIcon },
  { label: "Reading role, company and location", icon: ScanTextIcon },
  { label: "Finding the company website", icon: LinkIcon },
  { label: "Looking for the logo", icon: ImageIcon },
]
const TEXT_STEPS = [{ label: "Reading the text", icon: ScanTextIcon }, ...STEPS.slice(1)]

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** Link or pasted text in, a draft out. Shows the posting being read while it works. */
export function JobReader({ onDone, initialUrl = "", initialText = "", autoFocus = true }: { onDone: (result: ReadResult, source: { url: string; mode: "link" | "text" }) => void; initialUrl?: string; initialText?: string; autoFocus?: boolean }) {
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
      if (!result.ok) return void toast.error("Couldn’t read that posting", { description: result.error })
      onDone(result.data, { url: url.trim(), mode })
    })
  }

  if (reading) return <ReadingPosting host={mode === "link" ? hostOf(url) : "Pasted text"} steps={steps} step={step} />

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        read()
      }}
    >
      <ToggleGroup aria-label="How to add the job" variant="outline" size="sm" value={[mode]} onValueChange={(value) => value[0] && setMode(value[0] as "link" | "text")} className="w-fit">
        <ToggleGroupItem value="link">
          <LinkIcon /> Link
        </ToggleGroupItem>
        <ToggleGroupItem value="text">
          <ClipboardPasteIcon /> Paste text
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
                    if (!result.ok) return void toast.error("Couldn’t read that posting", { description: result.error })
                    onDone(result.data, { url: pasted, mode: "link" })
                  })
                }
              }}
              placeholder="Paste a job link…"
              aria-label="Job link"
              className="h-10"
            />
            <Button type="submit" size="lg" disabled={!ready}>
              <SparklesIcon /> Read
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Works with {BOARDS.slice(0, -1).join(", ")} and {BOARDS.at(-1)}. Behind a login? Use Paste text, or the browser extension.
          </p>
        </>
      ) : (
        <>
          <Textarea autoFocus={autoFocus} value={text} onChange={(event) => setText(event.target.value)} rows={9} placeholder="Paste the full job description, including the company name and role." aria-label="Job description" className="max-h-[50vh]" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">{text.trim().length < 80 ? `${80 - text.trim().length} more characters` : `${text.trim().length.toLocaleString()} characters`}</span>
            <Button type="submit" disabled={!ready}>
              <SparklesIcon /> Read text
            </Button>
          </div>
        </>
      )}
    </form>
  )
}

/** A posting being scanned: a page sketch with a moving read line, and the steps ticking off. */
function ReadingPosting({ host, steps, step }: { host: string; steps: typeof STEPS; step: number }) {
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
          <p className="text-sm font-medium">Reading the posting…</p>
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
                <span className={cn(current && "cb-shimmer font-medium")}>{item.label}</span>
              </li>
            )
          })}
        </ol>
        <p className="text-xs text-muted-foreground">Nothing is saved until you check it.</p>
      </div>
    </div>
  )
}

export const DRAFT_KEY = "naruvi:job-draft"

/** "Add a job" anywhere: a small dialog; the full review opens once the posting is read. */
export function AddJobDialog({ trigger }: { trigger: ReactElement }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a job</DialogTitle>
          <DialogDescription>Paste the link to the posting. Naruvi reads it, finds the company’s own website and logo, and lets you check everything before saving.</DialogDescription>
        </DialogHeader>
        <JobReader
          onDone={(result, source) => {
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...result, source }))
            router.push("/jobs/new?review=1")
            setOpen(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
