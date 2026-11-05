"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useState, useTransition } from "react"
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, ChevronRightIcon, ExternalLinkIcon, FileTextIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { generateCvAction, saveCvEditAction, setCurrentRevisionAction } from "@/app/(app)/applications/[id]/cv/actions"
import { DesignPicker } from "@/components/applications/design-picker"
import { DocumentShell, RegenerateButton, VersionsPanel, type Quality } from "@/components/documents/document-shell"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { CvDocument } from "@/server/documents/model"
import type { getCvWorkspace } from "@/server/documents/service"

type Workspace = NonNullable<Awaited<ReturnType<typeof getCvWorkspace>>>

function GenerateForm({ applicationId, language, label }: { applicationId: string; language: string; label: string }) {
  return (
    <form action={generateCvAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="language" value={language} />
      <RegenerateButton label={label} />
    </form>
  )
}

export function CvWorkspace({ applicationId, jobTitle, company, language, workspace }: { applicationId: string; jobTitle: string; company: string; language: string; workspace: Awaited<ReturnType<typeof getCvWorkspace>> }) {
  if (!workspace?.current) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-4 pt-6">
        <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href={`/applications/${applicationId}`} />}>
          <ArrowLeftIcon /> {jobTitle} · {company}
        </Button>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>Generate your {language.toUpperCase()} CV</EmptyTitle>
            <EmptyDescription>CareerBuddy picks the verified entries and approved bullets that best match this job. It writes no new claims: every line comes from your profile.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <form action={generateCvAction}>
              <input type="hidden" name="applicationId" value={applicationId} />
              <input type="hidden" name="language" value={language} />
              <Button type="submit">
                <SparklesIcon /> Generate CV
              </Button>
            </form>
          </EmptyContent>
        </Empty>
      </div>
    )
  }
  return <Editor applicationId={applicationId} jobTitle={jobTitle} company={company} language={language} workspace={workspace} />
}

function Editor({ applicationId, jobTitle, company, language, workspace }: { applicationId: string; jobTitle: string; company: string; language: string; workspace: Workspace }) {
  const router = useRouter()
  const current = workspace.current!
  const [draft, setDraft] = useState<CvDocument>(current.content)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(draft) !== JSON.stringify(current.content)

  const update = (fn: (doc: CvDocument) => void) =>
    setDraft((previous) => {
      const next = structuredClone(previous)
      fn(next)
      return next
    })

  const persist = useCallback(
    (content: CvDocument, message?: string) =>
      startTransition(async () => {
        const result = await saveCvEditAction(applicationId, workspace.document.id, content)
        if (!result.ok) return void toast.error("Not saved", { description: result.error })
        if (message) toast.success(message, { description: `${result.data.pages} page${result.data.pages === 1 ? "" : "s"} · quality ${result.data.score}${result.data.ready ? " · ready" : ""}` })
        router.refresh()
      }),
    [applicationId, router, workspace.document.id],
  )

  const restore = (revisionId: string) =>
    startTransition(async () => {
      const result = await setCurrentRevisionAction(applicationId, workspace.document.id, revisionId)
      if (!result.ok) return void toast.error(result.error)
      toast.success("Restored that version")
      router.refresh()
    })

  const applyDesign = (change: { template?: "classic" | "modern" | "serif"; accent?: string; showPhoto?: boolean }) => {
    const next = structuredClone(draft)
    if (change.template) next.template = change.template
    if (change.accent) next.accent = change.accent
    if (change.showPhoto !== undefined) next.header.showPhoto = change.showPhoto
    setDraft(next)
    persist(next)
  }

  return (
    <DocumentShell
      applicationId={applicationId}
      jobTitle={jobTitle}
      company={company}
      kind="cv"
      language={language}
      quality={current.quality as unknown as Quality}
      regenerate={<GenerateForm applicationId={applicationId} language={language} label="Regenerate" />}
      downloadHref={`/api/revisions/${current.id}/pdf?download=1`}
      previewUrl={`/api/revisions/${current.id}/pdf`}
      pageBudget={2}
      dirty={dirty}
      pending={pending}
      onSave={() => persist(draft, "Saved")}
      onDiscard={() => setDraft(current.content)}
      design={<DesignPicker template={draft.template ?? "classic"} accent={draft.accent ?? "#2563eb"} onChange={applyDesign} photo={{ available: Boolean(draft.header.photoPath), shown: draft.header.showPhoto }} disabled={pending} />}
      versions={<VersionsPanel revisions={workspace.history} currentId={current.id} pending={pending} onRestore={restore} />}
      content={<CvContent draft={draft} update={update} language={language} />}
    />
  )
}

function Mover({ onUp, onDown, upDisabled, downDisabled, label }: { onUp: () => void; onDown: () => void; upDisabled: boolean; downDisabled: boolean; label: string }) {
  return (
    <span className="flex shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
      <button type="button" aria-label={`Move ${label} up`} disabled={upDisabled} onClick={onUp} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30">
        <ArrowUpIcon className="size-3.5" />
      </button>
      <button type="button" aria-label={`Move ${label} down`} disabled={downDisabled} onClick={onDown} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30">
        <ArrowDownIcon className="size-3.5" />
      </button>
    </span>
  )
}

function swap<T>(list: T[], a: number, b: number) {
  ;[list[a], list[b]] = [list[b], list[a]]
}

function CvContent({ draft, update, language }: { draft: CvDocument; update: (fn: (doc: CvDocument) => void) => void; language: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(draft.sections.flatMap((s) => s.items.slice(0, 2).map((i) => [i.entryId, true]))))
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <p className="text-xs text-muted-foreground">Choose what goes on this CV. Extra approved bullets are listed, unchecked, ready to swap in. Wording itself is edited in your profile so every claim stays verified.</p>
      {draft.sections.map((section, s) => (
        <section key={section.id} className="grid min-w-0 grid-cols-1 gap-2">
          <div className="flex items-center justify-between">
            <h3 className={cn("text-xs font-semibold tracking-wide uppercase", section.included ? "text-foreground" : "text-muted-foreground line-through")}>{section.title}</h3>
            <Switch size="sm" checked={section.included} onCheckedChange={(value) => update((doc) => void (doc.sections[s].included = value))} aria-label={`Show ${section.title}`} />
          </div>
          {section.included && section.items.length ? (
            <div className="grid min-w-0 grid-cols-1 gap-2">
              {section.items.map((item, i) => {
                const included = item.bullets.filter((b) => b.included).length
                const expanded = open[item.entryId] ?? false
                return (
                  <div key={item.entryId} className={cn("rounded-lg border bg-card transition-opacity", !item.included && "opacity-60")}>
                    <div className="group/row flex items-center gap-2 px-2.5 py-2">
                      <button type="button" onClick={() => setOpen({ ...open, [item.entryId]: !expanded })} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <ChevronRightIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[item.organization, item.dates].filter(Boolean).join(" · ")}
                            {item.bullets.length ? ` · ${included} of ${item.bullets.length} bullets` : ""}
                          </span>
                        </span>
                      </button>
                      <Mover
                        label={item.title}
                        upDisabled={i === 0}
                        downDisabled={i === section.items.length - 1}
                        onUp={() => update((doc) => swap(doc.sections[s].items, i, i - 1))}
                        onDown={() => update((doc) => swap(doc.sections[s].items, i, i + 1))}
                      />
                      <Switch size="sm" checked={item.included} onCheckedChange={(value) => update((doc) => void (doc.sections[s].items[i].included = value))} aria-label={`Show ${item.title}`} />
                    </div>
                    {expanded && item.included && item.bullets.length ? (
                      <ul className="grid min-w-0 grid-cols-1 gap-0.5 border-t px-1.5 py-1.5">
                        {item.bullets.map((bullet, b) => (
                          <li key={bullet.id} className="group/row flex items-start gap-1 rounded-md hover:bg-muted/60">
                            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 px-1.5 py-1.5">
                              <Checkbox className="mt-0.5" checked={bullet.included} onCheckedChange={(value) => update((doc) => void (doc.sections[s].items[i].bullets[b].included = Boolean(value)))} />
                              <span className={cn("text-[13px] leading-5 [overflow-wrap:anywhere]", !bullet.included && "text-muted-foreground")}>{bullet.text}</span>
                            </label>
                            <Mover
                              label="bullet"
                              upDisabled={b === 0}
                              downDisabled={b === item.bullets.length - 1}
                              onUp={() => update((doc) => swap(doc.sections[s].items[i].bullets, b, b - 1))}
                              onDown={() => update((doc) => swap(doc.sections[s].items[i].bullets, b, b + 1))}
                            />
                          </li>
                        ))}
                        <li className="px-2 pt-1 pb-0.5">
                          <Link href={`/profile/${item.entryId}#bullets`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            Edit wording in profile <ExternalLinkIcon className="size-3" />
                          </Link>
                        </li>
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
          {section.included && section.groups.length ? (
            <div className="grid gap-1 rounded-lg border bg-card px-3 py-2 text-xs">
              {section.groups.map((group, g) => (
                <p key={g} className="[overflow-wrap:anywhere]">
                  {group.label ? <span className="font-medium">{group.label}: </span> : null}
                  <span className="text-muted-foreground">{group.values.join(" · ")}</span>
                </p>
              ))}
              <Link href="/profile" className="mt-1 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                Edit in profile <ExternalLinkIcon className="size-3" />
              </Link>
            </div>
          ) : null}
        </section>
      ))}
      {draft.missingTranslations.length ? (
        <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          Left out — no {language.toUpperCase()} wording yet:{" "}
          {draft.missingTranslations.map((m, index) => (
            <span key={m.entryId}>
              {index ? ", " : ""}
              <Link href={`/profile/${m.entryId}#bullets`} className="font-medium text-foreground underline underline-offset-2">
                {m.title}
              </Link>
            </span>
          ))}
          .
        </p>
      ) : null}
    </div>
  )
}
