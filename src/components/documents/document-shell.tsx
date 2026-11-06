"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  LanguagesIcon,
  DownloadIcon,
  Loader2Icon,
  SparklesIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react"
import { ApplicationNav } from "@/components/applications/application-nav"
import { PdfPreview } from "@/components/documents/pdf-preview"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAiToast } from "@/components/ai-progress"
import { WorkingBar } from "@/components/working-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export type Check = { id: string; status: "pass" | "warn" | "fail"; label: string; detail: string }
export type Quality = { score: number; ready: boolean; pages: number; checks: Check[] }
export type Revision = { id: string; origin: string; createdAt: Date | string; pages: number | null; quality: { score?: number } | null }

const LANGS = [
  { code: "en", label: "EN", name: "English" },
  { code: "fr", label: "FR", name: "Français" },
  { code: "es", label: "ES", name: "Español" },
  { code: "de", label: "DE", name: "Deutsch" },
]

export function RegenerateButton({ label = "Regenerate", steps, variant = "outline", size = "sm", icon }: { label?: string; steps: readonly string[]; variant?: "outline" | "default"; size?: "sm" | "default"; icon?: React.ReactNode }) {
  const { pending } = useFormStatus()
  useAiToast(pending, steps)
  return (
    <Button type="submit" size={size} variant={variant} disabled={pending}>
      {pending ? <SparklesIcon className="cb-breathe" /> : (icon ?? <RefreshCwIcon />)} <span className={pending ? "cb-shimmer" : undefined}>{pending ? "Working" : label}</span>
    </Button>
  )
}

/** Last open tab per document, kept across remounts in this browser session. */
const lastTab = new Map<string, string>()

/** Shared layout for the CV and cover-letter pages. */
export function DocumentShell({
  applicationId,
  jobTitle,
  company,
  kind,
  language,
  quality,
  regenerate,
  downloadHref,
  previewUrl,
  pageBudget,
  dirty,
  pending,
  onSave,
  onDiscard,
  content,
  design,
  versions,
}: {
  applicationId: string
  jobTitle: string
  company: string
  kind: "cv" | "letter"
  language: string
  quality: Quality
  regenerate: React.ReactNode
  downloadHref: string
  previewUrl: string
  pageBudget: number
  dirty: boolean
  pending: boolean
  onSave: () => void
  onDiscard: () => void
  content: React.ReactNode
  design: React.ReactNode
  versions: React.ReactNode
}) {
  // Saving a design or edit creates a new version and remounts this shell; keep the tab the user was on.
  const tabKey = `${applicationId}:${kind}`
  const [tab, setTabState] = useState(() => lastTab.get(tabKey) ?? "content")
  const setTab = (value: string) => {
    lastTab.set(tabKey, value)
    setTabState(value)
  }
  const issues = quality.checks.filter((check) => check.status !== "pass").length

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        if (dirty && !pending) onSave()
      }
    }
    const onUnload = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("beforeunload", onUnload)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("beforeunload", onUnload)
    }
  }, [dirty, pending, onSave])

  const base = `/applications/${applicationId}`
  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100svh-3.5rem)] flex-col md:-mx-6 md:-mt-6">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5 md:px-6">
        <Button variant="ghost" size="icon-sm" aria-label="Back to analysis" nativeButton={false} render={<Link href={base} />}>
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{jobTitle}</div>
          <div className="truncate text-xs text-muted-foreground">{company}</div>
        </div>
        <div className="ml-2">
          <ApplicationNav applicationId={applicationId} current={kind} language={language} />
        </div>
        <LanguageMenu current={language} hrefFor={(code) => `${base}/${kind}?lang=${code}`} />
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setTab("checks")} title={`Quality score ${quality.score}/100`}>
            {quality.ready ? <CheckCircle2Icon /> : <AlertTriangleIcon />}
            {quality.ready ? "Ready to send" : `${issues} thing${issues === 1 ? "" : "s"} to fix`}
          </Button>
          {regenerate}
          <Button size="sm" nativeButton={false} render={<a href={downloadHref} />}>
            <DownloadIcon /> Download PDF
          </Button>
        </div>
      </div>

      {/* body */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[440px_minmax(0,1fr)]">
        <Tabs value={tab} onValueChange={setTab} className="relative flex min-h-0 min-w-0 flex-col gap-0 border-r bg-background">
          <WorkingBar active={pending} />
          <TabsList variant="line" className="w-full justify-start gap-1 border-b px-3">
            <TabsTrigger value="content">Edit</TabsTrigger>
            <TabsTrigger value="design">Look</TabsTrigger>
            <TabsTrigger value="checks" className="gap-1.5">
              Checks
              {issues ? <Badge variant={quality.checks.some((c) => c.status === "fail") ? "destructive" : "secondary"} className="h-4 px-1.5 text-[11px] tabular-nums">{issues}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="versions">History</TabsTrigger>
          </TabsList>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <TabsContent value="content" className="p-4">
              {content}
            </TabsContent>
            <TabsContent value="design" className="p-4">
              {design}
            </TabsContent>
            <TabsContent value="checks" className="p-4">
              <QualityPanel quality={quality} />
            </TabsContent>
            <TabsContent value="versions" className="p-4">
              {versions}
            </TabsContent>
          </div>
          <div className={cn("flex items-center gap-2 border-t px-4 py-2.5 transition-colors", dirty ? "bg-muted" : "bg-background")}>
            {dirty ? (
              <>
                <span className="text-xs text-muted-foreground">Unsaved changes. The preview updates when you save.</span>
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={onDiscard} disabled={pending}>
                    Discard
                  </Button>
                  <Button size="sm" onClick={onSave} disabled={pending}>
                    {pending ? <Loader2Icon className="animate-spin" /> : null} Save <Kbd className="ml-0.5">⌘S</Kbd>
                  </Button>
                </div>
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {pending ? <Loader2Icon className="size-3 animate-spin" /> : <CheckCircle2Icon className="size-3" />}
                <span key={pending ? "saving" : "saved"} className="cb-fade">{pending ? "Saving…" : "All changes saved"}</span>
              </span>
            )}
          </div>
        </Tabs>
        <div className="hidden min-h-0 p-4 lg:flex">
          <PdfPreview key={previewUrl} url={previewUrl} pageBudget={pageBudget} busy={pending} className="flex-1" />
        </div>
      </div>
    </div>
  )
}

export function QualityPanel({ quality }: { quality: Quality }) {
  const order = { fail: 0, warn: 1, pass: 2 }
  const checks = [...quality.checks].sort((a, b) => order[a.status] - order[b.status])
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 rounded-lg border p-3">
        {quality.ready ? <CheckCircle2Icon className="size-5 text-emerald-600" /> : <AlertTriangleIcon className="size-5 text-amber-500" />}
        <div className="flex-1">
          <div className="text-sm font-medium">{quality.ready ? "Ready to send" : "Not ready yet"}</div>
          <div className="text-xs text-muted-foreground">
            {quality.pages} page{quality.pages === 1 ? "" : "s"} · checked on the saved version
          </div>
        </div>
        <span className="text-2xl font-semibold tabular-nums">{quality.score}</span>
      </div>
      <ul className="grid gap-2">
        {checks.map((check) => (
          <li key={check.id} className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm", check.status === "fail" ? "bg-rose-50 dark:bg-rose-950/30" : check.status === "warn" ? "bg-amber-50 dark:bg-amber-950/30" : "")}>
            {check.status === "pass" ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : check.status === "warn" ? <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" /> : <XCircleIcon className="mt-0.5 size-4 shrink-0 text-rose-600" />}
            <div className="min-w-0">
              <div className="font-medium">{check.label}</div>
              <div className="text-xs text-muted-foreground">{check.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ORIGIN: Record<string, string> = { generate: "Generated", manual: "Edited", restore: "Restored" }

export function VersionsPanel({ revisions, currentId, pending, onRestore }: { revisions: Revision[]; currentId: string; pending: boolean; onRestore: (id: string) => void }) {
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">Every save is a new version; nothing is ever overwritten. Restoring makes an older version current again.</p>
      <ol className="relative grid gap-1 border-l pl-4">
        {revisions.map((revision) => {
          const isCurrent = revision.id === currentId
          return (
            <li key={revision.id} className="relative">
              <span className={cn("absolute top-3 -left-[21px] size-2.5 rounded-full border-2 border-background", isCurrent ? "bg-foreground" : "bg-muted-foreground/40")} />
              <div className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-xs", isCurrent && "bg-muted")}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{ORIGIN[revision.origin] ?? revision.origin}</div>
                  <div className="text-muted-foreground">{new Date(revision.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</div>
                </div>
                <span className="text-muted-foreground tabular-nums">
                  {revision.pages ?? "—"}p · {revision.quality?.score ?? "—"}
                </span>
                {isCurrent ? (
                  <Badge variant="secondary" className="text-[11px]">
                    current
                  </Badge>
                ) : (
                  <Button size="xs" variant="ghost" onClick={() => onRestore(revision.id)} disabled={pending}>
                    <RotateCcwIcon /> Restore
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Document language as a small menu instead of four cryptic codes. */
export function LanguageMenu({ current, hrefFor }: { current: string; hrefFor: (code: string) => string }) {
  const active = LANGS.find((item) => item.code === current)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" aria-label="Document language" />}>
        <LanguagesIcon /> {active?.name ?? current.toUpperCase()} <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Write this document in</DropdownMenuLabel>
          {LANGS.map((item) => (
            <DropdownMenuItem key={item.code} render={<Link href={hrefFor(item.code)} />}>
              {item.name}
              {item.code === current ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
