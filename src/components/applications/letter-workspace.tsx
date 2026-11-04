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
  HistoryIcon,
  Loader2Icon,
  MailIcon,
  PenLineIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react"
import { toast } from "sonner"
import { generateLetterAction, saveCvEditAction, setCurrentRevisionAction } from "@/app/(app)/applications/[id]/cv/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { LetterDocument } from "@/server/documents/letter"
import type { getLetterWorkspace } from "@/server/documents/service"

type Workspace = NonNullable<Awaited<ReturnType<typeof getLetterWorkspace>>>

const LANGS = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
]

const DECISION: Record<string, string> = {
  required: "This posting asks for a cover letter.",
  optional: "A cover letter is optional for this posting — include one if it strengthens your application.",
  not_requested: "This posting says no cover letter is needed.",
  not_mentioned: "The posting doesn’t mention a cover letter; one can still help.",
}

const PARAGRAPH_LABEL: Record<string, string> = { opening: "Opening", motivation: "Why this company", closing: "Closing", custom: "Paragraph" }

function Submit({ label, variant = "default" }: { label: string; variant?: "default" | "outline" }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? <Loader2Icon className="animate-spin" /> : variant === "outline" ? <RefreshCwIcon /> : <PenLineIcon />} {pending ? "Writing…" : label}
    </Button>
  )
}

function GenerateForm({ applicationId, language, label, variant }: { applicationId: string; language: string; label: string; variant?: "default" | "outline" }) {
  return (
    <form action={generateLetterAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="language" value={language} />
      <Submit label={label} variant={variant} />
    </form>
  )
}

export function LetterWorkspace({
  applicationId,
  jobTitle,
  company,
  language,
  decision,
  workspace,
}: {
  applicationId: string
  jobTitle: string
  company: string
  language: string
  decision: { decision: string; evidence: string } | null
  workspace: Awaited<ReturnType<typeof getLetterWorkspace>>
}) {
  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/applications/${applicationId}`} />}>
        <ArrowLeftIcon /> Analysis
      </Button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold tracking-tight">Cover letter · {jobTitle}</h1>
        <p className="text-xs text-muted-foreground">
          {company} ·{" "}
          <Link href={`/applications/${applicationId}/cv?lang=${language}`} className="hover:underline">
            open CV
          </Link>
        </p>
      </div>
      <div className="flex rounded-md border p-0.5">
        {LANGS.map((item) => (
          <Link key={item.code} href={`/applications/${applicationId}/letter?lang=${item.code}`} className={cn("rounded px-2.5 py-1 text-xs", item.code === language ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
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
              <MailIcon />
            </EmptyMedia>
            <EmptyTitle>Draft a cover letter</EmptyTitle>
            <EmptyDescription>
              {decision ? `${DECISION[decision.decision] ?? ""} ` : ""}The draft uses your proven, approved bullets as evidence and standard wording for the rest. The one part only you can write — why this company — is left for you.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <GenerateForm applicationId={applicationId} language={language} label="Draft cover letter" />
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
  const [draft, setDraft] = useState<LetterDocument>(current.content)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(draft) !== JSON.stringify(current.content)
  const instruction = (current.content.paragraphs.find((p) => p.kind === "motivation")?.text ?? "").replace(/^\s*\[|\]\s*$/g, "")
  const quality = current.quality as unknown as { score: number; ready: boolean; pages: number; checks: { id: string; status: "pass" | "warn" | "fail"; label: string; detail: string }[] }

  const update = (fn: (doc: LetterDocument) => void) =>
    setDraft((previous) => {
      const next = structuredClone(previous)
      fn(next)
      return next
    })

  const save = () =>
    startTransition(async () => {
      const result = await saveCvEditAction(applicationId, workspace.document.id, draft)
      if (!result.ok) return void toast.error("Not saved", { description: result.error })
      toast.success(`Saved · quality ${result.data.score}`, { description: result.data.ready ? "Ready to send." : "See the checks for what’s left." })
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  {quality.ready ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : <AlertTriangleIcon className="size-4 text-amber-500" />}
                  {quality.ready ? "Ready to send" : "Not ready yet"}
                </span>
                <Badge variant={quality.ready ? "default" : "secondary"} className="tabular-nums">
                  {quality.score}/100
                </Badge>
              </CardTitle>
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
              <CardTitle className="text-sm">Letter</CardTitle>
              <CardDescription>Edit freely. Highlights come from your approved, fact-backed bullets.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" value={draft.subject} onChange={(event) => update((doc) => void (doc.subject = event.target.value))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="salutation">Greeting</Label>
                <Input id="salutation" value={draft.salutation} onChange={(event) => update((doc) => void (doc.salutation = event.target.value))} />
              </div>
              {draft.paragraphs.map((paragraph, index) =>
                paragraph.kind === "highlights" ? (
                  <div key={paragraph.id} className="grid gap-2 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Evidence highlights</span>
                      <span className="text-xs text-muted-foreground">{draft.highlights.filter((h) => h.included).length} included</span>
                    </div>
                    <Input aria-label="Highlights introduction" value={draft.highlightsIntro} onChange={(event) => update((doc) => void (doc.highlightsIntro = event.target.value))} />
                    {draft.highlights.length ? (
                      <ul className="grid gap-1.5">
                        {draft.highlights.map((highlight, h) => (
                          <li key={highlight.id} className="group flex items-start gap-2">
                            <Checkbox className="mt-0.5" checked={highlight.included} onCheckedChange={(value) => update((doc) => void (doc.highlights[h].included = Boolean(value)))} aria-label="Include highlight" />
                            <span className={cn("min-w-0 flex-1 text-xs leading-5", !highlight.included && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                              {highlight.text} <span className="text-muted-foreground">({highlight.organization})</span>
                            </span>
                            <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
                              <button type="button" aria-label="Move up" disabled={h === 0} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => update((doc) => void ([doc.highlights[h - 1], doc.highlights[h]] = [doc.highlights[h], doc.highlights[h - 1]]))}>
                                <ArrowUpIcon className="size-3" />
                              </button>
                              <button type="button" aria-label="Move down" disabled={h === draft.highlights.length - 1} className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => update((doc) => void ([doc.highlights[h + 1], doc.highlights[h]] = [doc.highlights[h], doc.highlights[h + 1]]))}>
                                <ArrowDownIcon className="size-3" />
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">No approved bullet in this language backs a proven requirement yet.</p>
                    )}
                  </div>
                ) : (
                  <div key={paragraph.id} className="grid gap-1.5">
                    <Label htmlFor={`p-${paragraph.id}`} className="flex items-center gap-2">
                      {PARAGRAPH_LABEL[paragraph.kind] ?? "Paragraph"}
                      {paragraph.kind === "motivation" && /^\s*\[/.test(paragraph.text) ? <Badge variant="outline" className="border-amber-300 text-amber-700">your words needed</Badge> : null}
                    </Label>
                    <Textarea
                      id={`p-${paragraph.id}`}
                      rows={paragraph.kind === "motivation" ? 4 : 3}
                      value={paragraph.text}
                      placeholder={paragraph.kind === "motivation" ? instruction : undefined}
                      onFocus={() => {
                        // Start from a blank paragraph; the instruction stays visible as the placeholder.
                        if (paragraph.kind === "motivation" && /^\s*\[/.test(paragraph.text)) update((doc) => void (doc.paragraphs[index].text = ""))
                      }}
                      onChange={(event) => update((doc) => void (doc.paragraphs[index].text = event.target.value))}
                      className={cn(paragraph.kind === "motivation" && /^\s*\[|^$/.test(paragraph.text) && "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20")}
                    />
                  </div>
                ),
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="signoff">Sign-off</Label>
                <Input id="signoff" value={draft.signoff} onChange={(event) => update((doc) => void (doc.signoff = event.target.value))} />
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <HistoryIcon className="size-4" /> Versions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1">
                {workspace.history.map((revision) => {
                  const isCurrent = revision.id === current.id
                  return (
                    <li key={revision.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-xs", isCurrent && "bg-muted")}>
                      <span className="font-medium">{revision.origin === "generate" ? "Drafted" : "Edited"}</span>
                      <span className="text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</span>
                      <span className="ml-auto text-muted-foreground tabular-nums">{revision.quality?.score ?? "—"}</span>
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
                <span className="text-xs text-amber-600">Unsaved — the preview shows the saved version.</span>
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
              <GenerateForm applicationId={applicationId} language={language} label="Redraft" variant="outline" />
              <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/revisions/${current.id}/pdf?download=1`} />}>
                <DownloadIcon /> PDF
              </Button>
            </div>
          </div>
          <iframe key={current.id} src={`/api/revisions/${current.id}/pdf#view=FitH`} title="Cover letter preview" className="h-[calc(100svh-9rem)] min-h-[640px] w-full rounded-xl border bg-white" />
        </div>
      </div>
    </div>
  )
}

