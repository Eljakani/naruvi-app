"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import {
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileTextIcon,
  HistoryIcon,
  Loader2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react"
import { toast } from "sonner"
import { generateCvAction, saveCvEditAction, setCurrentRevisionAction } from "@/app/(app)/applications/[id]/cv/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { CvDocument } from "@/server/documents/model"
import type { getCvWorkspace } from "@/server/documents/service"

type Workspace = NonNullable<Awaited<ReturnType<typeof getCvWorkspace>>>

const LANGS = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
]

function GenerateButton({ label, variant = "default" }: { label: string; variant?: "default" | "outline" }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" /> : variant === "outline" ? <RefreshCwIcon /> : <SparklesIcon />} {pending ? "Generating…" : label}
    </Button>
  )
}

function GenerateForm({ applicationId, language, label, variant }: { applicationId: string; language: string; label: string; variant?: "default" | "outline" }) {
  return (
    <form action={generateCvAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="language" value={language} />
      <GenerateButton label={label} variant={variant} />
    </form>
  )
}

const ORIGIN: Record<string, string> = { generate: "Generated", manual: "Edited", restore: "Restored", enhance: "Enhanced", fix: "Fixed", repair: "Repaired", translate: "Translated" }

export function CvWorkspace({ applicationId, jobTitle, company, language, workspace }: { applicationId: string; jobTitle: string; company: string; language: string; workspace: Awaited<ReturnType<typeof getCvWorkspace>> }) {
  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/applications/${applicationId}`} />}>
        <ArrowLeftIcon /> Analysis
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight">CV · {jobTitle}</h1>
        <p className="text-xs text-muted-foreground">{company}</p>
      </div>
      <div className="flex rounded-md border p-0.5">
        {LANGS.map((item) => (
          <Link
            key={item.code}
            href={`/applications/${applicationId}/cv?lang=${item.code}`}
            className={cn("rounded px-2.5 py-1 text-xs", item.code === language ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )

  if (!workspace?.current) {
    return (
      <div className="grid gap-4">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>No {LANGS.find((l) => l.code === language)?.label ?? language.toUpperCase()} CV yet</EmptyTitle>
            <EmptyDescription>
              CareerBuddy picks your verified entries and approved bullets that best match this job. It writes no new claims: every line comes from your profile.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <GenerateForm applicationId={applicationId} language={language} label="Generate CV" />
          </EmptyContent>
        </Empty>
      </div>
    )
  }
  return <Editor header={header} applicationId={applicationId} language={language} workspace={workspace} />
}

function Editor({ header, applicationId, language, workspace }: { header: React.ReactNode; applicationId: string; language: string; workspace: Workspace }) {
  const router = useRouter()
  const current = workspace.current!
  const [draft, setDraft] = useState<CvDocument>(current.content)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(draft) !== JSON.stringify(current.content)
  const quality = current.quality

  const update = (fn: (doc: CvDocument) => void) =>
    setDraft((previous) => {
      const next = structuredClone(previous)
      fn(next)
      return next
    })

  const save = () =>
    startTransition(async () => {
      const result = await saveCvEditAction(applicationId, workspace.document.id, draft)
      if (!result.ok) return void toast.error("Not saved", { description: result.error })
      toast.success(`Saved · ${result.data.pages} page${result.data.pages === 1 ? "" : "s"} · quality ${result.data.score}`, { description: result.data.ready ? "Ready to send." : "See the quality checks for what to fix." })
      router.refresh()
    })

  const restore = (revisionId: string) =>
    startTransition(async () => {
      const result = await setCurrentRevisionAction(applicationId, workspace.document.id, revisionId)
      if (!result.ok) return void toast.error(result.error)
      toast.success("Restored that version")
      router.refresh()
    })

  return (
    <div className="grid gap-4">
      {header}
      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  {quality.ready ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : <AlertTriangleIcon className="size-4 text-amber-500" />}
                  {quality.ready ? "Ready to send" : "Needs a pass"}
                </span>
                <Badge variant={quality.ready ? "default" : "secondary"} className="tabular-nums">
                  {quality.score}/100
                </Badge>
              </CardTitle>
              <CardDescription>
                {current.pages} page{current.pages === 1 ? "" : "s"} · checks run on the saved version
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1.5">
                {quality.checks.map((check) => (
                  <li key={check.id} className="flex items-start gap-2 text-xs">
                    {check.status === "pass" ? <CheckCircle2Icon className="mt-px size-3.5 shrink-0 text-emerald-600" /> : check.status === "warn" ? <AlertTriangleIcon className="mt-px size-3.5 shrink-0 text-amber-500" /> : <XCircleIcon className="mt-px size-3.5 shrink-0 text-rose-600" />}
                    <span>
                      <span className="font-medium">{check.label}</span>
                      <span className="text-muted-foreground"> — {check.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Content</CardTitle>
              <CardDescription>Switch entries and bullets on or off. Extra approved bullets are listed, off, ready to swap in.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {draft.sections.map((section, s) => (
                <div key={section.id} className="grid gap-2">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{section.title}</span>
                    <Switch size="sm" checked={section.included} onCheckedChange={(value) => update((doc) => void (doc.sections[s].included = value))} aria-label={`Include ${section.title}`} />
                  </label>
                  {section.included
                    ? section.items.map((item, i) => (
                        <div key={item.entryId} className={cn("grid gap-1.5 rounded-lg border p-2.5", !item.included && "opacity-55")}>
                          <label className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {item.title}
                              {item.organization ? <span className="font-normal text-muted-foreground"> · {item.organization}</span> : null}
                            </span>
                            <Switch size="sm" checked={item.included} onCheckedChange={(value) => update((doc) => void (doc.sections[s].items[i].included = value))} aria-label={`Include ${item.title}`} />
                          </label>
                          {item.included && item.bullets.length ? (
                            <ul className="grid gap-1">
                              {item.bullets.map((bullet, b) => (
                                <li key={bullet.id} className="group flex items-start gap-2">
                                  <Checkbox className="mt-0.5" checked={bullet.included} onCheckedChange={(value) => update((doc) => void (doc.sections[s].items[i].bullets[b].included = Boolean(value)))} aria-label="Include bullet" />
                                  <span className={cn("min-w-0 flex-1 text-xs leading-5", !bullet.included && "text-muted-foreground line-through decoration-muted-foreground/40")}>{bullet.text}</span>
                                  <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
                                    <button type="button" aria-label="Move up" disabled={b === 0} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => update((doc) => {
                                      const list = doc.sections[s].items[i].bullets
                                      ;[list[b - 1], list[b]] = [list[b], list[b - 1]]
                                    })}>
                                      <ArrowUpIcon className="size-3" />
                                    </button>
                                    <button type="button" aria-label="Move down" disabled={b === item.bullets.length - 1} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => update((doc) => {
                                      const list = doc.sections[s].items[i].bullets
                                      ;[list[b + 1], list[b]] = [list[b], list[b + 1]]
                                    })}>
                                      <ArrowDownIcon className="size-3" />
                                    </button>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))
                    : null}
                </div>
              ))}
              {draft.missingTranslations.length ? (
                <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
                  Left out (no {language.toUpperCase()} wording yet):{" "}
                  {draft.missingTranslations.map((m, index) => (
                    <span key={m.entryId}>
                      {index ? ", " : ""}
                      <Link href={`/profile/${m.entryId}#bullets`} className="underline underline-offset-2">
                        {m.title}
                      </Link>
                    </span>
                  ))}
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <HistoryIcon className="size-4" /> Versions
              </CardTitle>
              <CardDescription>Every save is a new version; nothing is overwritten.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1">
                {workspace.history.map((revision) => {
                  const isCurrent = revision.id === current.id
                  return (
                    <li key={revision.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-xs", isCurrent && "bg-muted")}>
                      <span className="font-medium">{ORIGIN[revision.origin] ?? revision.origin}</span>
                      <span className="text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</span>
                      <span className="ml-auto text-muted-foreground tabular-nums">
                        {revision.pages}p · {revision.quality?.score ?? "—"}
                      </span>
                      {isCurrent ? (
                        <Badge variant="secondary" className="text-[10px]">
                          current
                        </Badge>
                      ) : (
                        <Button size="xs" variant="ghost" onClick={() => restore(revision.id)} disabled={pending}>
                          <RotateCcwIcon /> Restore
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-3 xl:sticky xl:top-4">
          <div className="flex flex-wrap items-center gap-2">
            {dirty ? (
              <>
                <span className="text-xs text-amber-600">Unsaved changes — the preview shows the saved version.</span>
                <Button size="sm" variant="ghost" onClick={() => setDraft(current.content)} disabled={pending}>
                  Discard
                </Button>
                <Button size="sm" onClick={save} disabled={pending}>
                  {pending ? <Loader2Icon className="animate-spin" /> : null} Save & check
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}
            <div className="ml-auto flex gap-2">
              <GenerateForm applicationId={applicationId} language={language} label="Regenerate" variant="outline" />
              <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/revisions/${current.id}/pdf?download=1`} />}>
                <DownloadIcon /> PDF
              </Button>
            </div>
          </div>
          <iframe key={current.id} src={`/api/revisions/${current.id}/pdf#view=FitH`} title="CV preview" className="h-[calc(100svh-9rem)] min-h-[640px] w-full rounded-xl border bg-white" />
        </div>
      </div>
    </div>
  )
}
