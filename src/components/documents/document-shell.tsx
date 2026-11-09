"use client"

import Link from "next/link"
import { createContext, useContext, useEffect, useState } from "react"
import { useFormStatus } from "react-dom"
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, CheckIcon, ChevronDownIcon, DownloadIcon, EyeIcon, HistoryIcon, LanguagesIcon, Loader2Icon, PaletteIcon, PencilLineIcon, RefreshCwIcon, RotateCcwIcon, ShieldCheckIcon, SparklesIcon, XCircleIcon } from "lucide-react"
import { AI_FIXABLE_CHECKS } from "@/lib/quality-fixable"
import { EntryLogo } from "@/components/profile/entry-logo"
import { ApplicationNav } from "@/components/applications/application-nav"
import { PdfPreview } from "@/components/documents/pdf-preview"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useAiToast } from "@/components/ai-progress"
import { WorkingBar } from "@/components/working-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tabs, TabsContent, TabsList, TabsTrigger, TabsIndicator } from "@/components/ui/tabs"
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
/** The company logo for the document header, supplied by the page so the workspaces don't need to pass it along. */
const CompanyLogoContext = createContext<string | null>(null)
export function CompanyLogoProvider({ logo, children }: { logo: string | null; children: React.ReactNode }) {
  return <CompanyLogoContext.Provider value={logo}>{children}</CompanyLogoContext.Provider>
}

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
  checkFix,
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
  /** When the document can be fixed by Naruvi (the CV), the Checks tab offers "Fix with Naruvi". */
  checkFix?: { fixing: string | null; fix: (check: { id: string; label: string; detail: string }) => void }
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
  const logo = useContext(CompanyLogoContext)
  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100svh-3.5rem)] flex-col md:-mx-6 md:-mt-6">
      {/* top bar: who it's for on the left, where you are in the middle, what to do on the right. One row, wraps only when narrow. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2.5 md:px-6">
        <Button variant="ghost" size="icon-sm" aria-label="Back to the application" nativeButton={false} render={<Link href={base} />}>
          <ArrowLeftIcon />
        </Button>
        <Link href={base} className="group/title flex min-w-0 flex-1 basis-56 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
          <EntryLogo path={logo} name={company || jobTitle} size={32} className="shrink-0" />
          <span className="grid min-w-0">
            <span className="truncate text-sm font-semibold group-hover/title:underline" title={jobTitle}>{jobTitle}</span>
            <span className="truncate text-xs text-muted-foreground">{company || "No company"}</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ApplicationNav applicationId={applicationId} current={kind} language={language} />
          <LanguageMenu current={language} hrefFor={(code) => `${base}/${kind}?lang=${code}`} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setTab("checks")} title={`Quality score ${quality.score}/100`}
            className={cn("rounded-full", quality.ready ? "text-emerald-700 hover:text-emerald-800 dark:text-emerald-400" : "bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300")}>
            {quality.ready ? <CheckCircle2Icon /> : <AlertTriangleIcon />}
            <span className="max-sm:hidden">{quality.ready ? "Ready to send" : `${issues} thing${issues === 1 ? "" : "s"} to fix`}</span>
          </Button>
          {regenerate}
          <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" nativeButton={false} render={<a href={downloadHref} />}>
            <DownloadIcon /> <span className="max-sm:hidden">Download PDF</span>
          </Button>
        </div>
      </div>

      {/* body */}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <Tabs value={tab} onValueChange={setTab} className="relative flex min-h-0 min-w-0 flex-col gap-0 border-r bg-background">
          <WorkingBar active={pending} />
          <div className="border-b px-3 py-2">
            {/* Same pill switcher as Analysis / CV / Cover letter, with a pill that glides to the active tab. */}
            <TabsList className="relative grid h-auto! w-full grid-cols-4 gap-0 rounded-lg bg-muted p-0.5 [&_[data-slot=tabs-trigger]]:z-10 [&_[data-slot=tabs-trigger]]:h-7 [&_[data-slot=tabs-trigger]]:gap-1.5 [&_[data-slot=tabs-trigger]]:text-xs [&_[data-slot=tabs-trigger]]:text-muted-foreground [&_[data-slot=tabs-trigger]]:data-active:bg-transparent [&_[data-slot=tabs-trigger]]:data-active:text-foreground [&_[data-slot=tabs-trigger]]:data-active:shadow-none [&_[data-slot=tabs-trigger]_svg]:size-3.5">
              <TabsTrigger value="content"><PencilLineIcon /> Edit</TabsTrigger>
              <TabsTrigger value="design"><PaletteIcon /> Look</TabsTrigger>
              <TabsTrigger value="checks" aria-label={issues ? `Checks, ${issues} to fix` : "Checks, all passing"}>
                <ShieldCheckIcon /> Checks
                {issues ? (
                  <span className={cn("grid h-4 min-w-4 place-content-center rounded-full px-1 text-[10px] font-semibold tabular-nums", quality.checks.some((c) => c.status === "fail") ? "bg-destructive text-white" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>{issues}</span>
                ) : <CheckCircle2Icon className="text-emerald-600" />}
              </TabsTrigger>
              <TabsTrigger value="versions"><HistoryIcon /> History</TabsTrigger>
              <TabsIndicator className="top-(--active-tab-top) bottom-auto h-(--active-tab-height) rounded-md bg-background shadow-xs ring-1 ring-foreground/5" />
            </TabsList>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <TabsContent value="content" className="p-4 [animation:cb-rise_200ms_var(--ease-out)_both]">
              {content}
            </TabsContent>
            <TabsContent value="design" className="p-4 [animation:cb-rise_200ms_var(--ease-out)_both]">
              {design}
            </TabsContent>
            <TabsContent value="checks" className="p-4 [animation:cb-rise_200ms_var(--ease-out)_both]">
              <QualityPanel quality={quality} checkFix={checkFix} dirty={dirty} onReview={() => setTab("content")} />
            </TabsContent>
            <TabsContent value="versions" className="p-4 [animation:cb-rise_200ms_var(--ease-out)_both]">
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
        <div className="hidden min-h-0 min-w-0 flex-col p-4 lg:flex">
          <PdfPreview key={previewUrl} url={previewUrl} pageBudget={pageBudget} busy={pending} className="flex-1" />
        </div>
      </div>
    </div>
  )
}

export function QualityPanel({ quality, checkFix, dirty = false, onReview }: { onReview?: () => void; quality: Quality; checkFix?: { fixing: string | null; fix: (check: { id: string; label: string; detail: string }) => void }; dirty?: boolean }) {
  const order = { fail: 0, warn: 1, pass: 2 }
  const checks = [...quality.checks].sort((a, b) => order[a.status] - order[b.status])
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3 rounded-lg border p-3">
        {quality.ready ? <CheckCircle2Icon className="size-5 text-emerald-600" /> : <AlertTriangleIcon className="size-5 text-amber-500" />}
        <div className="flex-1">
          <div className="text-sm font-medium">{quality.ready ? "Ready to send" : "Not ready yet"}</div>
          <div className="text-xs text-muted-foreground">
            {quality.pages} page{quality.pages === 1 ? "" : "s"} · checked on the saved version{dirty ? ". Save to re-check your changes." : ""}
          </div>
        </div>
        <span className="text-2xl font-semibold tabular-nums">{quality.score}</span>
      </div>
      <ul className="grid gap-2">
        {checks.map((check) => (
          <li key={check.id} className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm", check.status === "fail" ? "bg-rose-50 dark:bg-rose-950/30" : check.status === "warn" ? "bg-amber-50 dark:bg-amber-950/30" : "")}>
            {check.status === "pass" ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : check.status === "warn" ? <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" /> : <XCircleIcon className="mt-0.5 size-4 shrink-0 text-rose-600" />}
            <div className="grid min-w-0 flex-1 gap-1.5">
              <div>
                <div className="font-medium">{check.label}</div>
                <div className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{check.detail}</div>
              </div>
              {checkFix && check.status !== "pass" && AI_FIXABLE_CHECKS.has(check.id) && !(check.id === "pages" && check.status === "warn") ? (
                <Button size="xs" variant="outline" className="w-fit bg-background" disabled={checkFix.fixing !== null} onClick={() => checkFix.fix(check)}>
                  {checkFix.fixing === check.id ? <Loader2Icon className="animate-spin" /> : <SparklesIcon className="text-brand" />}
                  {checkFix.fixing === check.id ? "Naruvi is fixing it…" : "Fix with Naruvi"}
                </Button>
              ) : check.id === "ai-review" && check.status === "fail" && onReview ? (
                // Only you can approve AI wording, so this takes you to it instead of fixing it.
                <Button size="xs" variant="outline" className="w-fit bg-background" onClick={onReview}>
                  <EyeIcon /> Review in editor
                </Button>
              ) : null}
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
