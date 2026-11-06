"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useState, useTransition } from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, ExternalLinkIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { generateCvAction, saveCvEditAction, setCurrentRevisionAction } from "@/app/(app)/applications/[id]/cv/actions"
import { DocumentStart } from "@/components/documents/document-start"
import { DEFAULT_PRESET, PRESETS, type DesignTokens } from "@/lib/design"

const LANGUAGE_NAME: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German" }
import { DesignPicker, type DesignChange, type SavedDesign } from "@/components/applications/design-picker"
import { AiReviewPanel } from "@/components/documents/ai-review-panel"
import { CvAssistant, LineAssistant } from "@/components/applications/cv-assistant"
import { AI_STEPS } from "@/components/ai-progress"
import { DocumentShell, RegenerateButton, VersionsPanel, type Quality } from "@/components/documents/document-shell"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { CvDocument } from "@/server/documents/model"
import type { getCvWorkspace } from "@/server/documents/service"

type Workspace = NonNullable<Awaited<ReturnType<typeof getCvWorkspace>>>

function GenerateForm({ applicationId, language, label }: { applicationId: string; language: string; label: string }) {
  return (
    <form action={generateCvAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="language" value={language} />
      <RegenerateButton label={label} steps={AI_STEPS.cv} />
    </form>
  )
}

export function CvWorkspace({ applicationId, jobTitle, company, language, workspace, savedTemplates, startDesign = { tokens: PRESETS[DEFAULT_PRESET].tokens, name: PRESETS[DEFAULT_PRESET].name } }: { applicationId: string; jobTitle: string; company: string; language: string; workspace: Awaited<ReturnType<typeof getCvWorkspace>>; savedTemplates: SavedDesign[]; startDesign?: { tokens: DesignTokens; name: string } }) {
  if (!workspace?.current) {
    return (
      <DocumentStart
        applicationId={applicationId}
        jobTitle={jobTitle}
        company={company}
        kind="cv"
        language={language}
        steps={AI_STEPS.cv}
        action={generateCvAction}
        label="Write my CV"
        icon={<SparklesIcon />}
        title="Your CV for this job"
        lead={`Written in ${LANGUAGE_NAME[language] ?? language.toUpperCase()} from your verified profile, tailored to this posting. About 20 seconds.`}
        design={startDesign.tokens}
        designName={startDesign.name}
      />
    )
  }
  return <Editor applicationId={applicationId} jobTitle={jobTitle} company={company} language={language} workspace={workspace} savedTemplates={savedTemplates} />
}

function Editor({ applicationId, jobTitle, company, language, workspace, savedTemplates }: { applicationId: string; jobTitle: string; company: string; language: string; workspace: Workspace; savedTemplates: SavedDesign[] }) {
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
    (content: CvDocument, message?: string, onSaved?: () => void) =>
      startTransition(async () => {
        const result = await saveCvEditAction(applicationId, workspace.document.id, content)
        if (!result.ok) return void toast.error("Not saved", { description: result.error })
        onSaved?.()
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

  const applyDesign = (change: DesignChange) => {
    const next = structuredClone(draft)
    if (change.template) next.template = change.template as typeof next.template
    if (change.design === null) delete next.design
    else if (change.design) next.design = change.design
    if (change.templateRef === null) delete next.templateRef
    else if (change.templateRef) next.templateRef = change.templateRef
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
      design={<DesignPicker template={draft.template ?? "classic"} accent={draft.accent ?? "#2563eb"} design={draft.design} templateRef={draft.templateRef} saved={savedTemplates} onChange={applyDesign} photo={{ available: Boolean(draft.header.photoPath), shown: draft.header.showPhoto }} disabled={pending} />}
      versions={<VersionsPanel revisions={workspace.history} currentId={current.id} pending={pending} onRestore={restore} />}
      content={<div className="grid gap-5">
        <AiReviewPanel assistance={draft.aiAssistance} pending={pending}
          changes={draft.sections.flatMap((section) => section.items.flatMap((item) => item.bullets.filter((bullet) => bullet.originalText).map((bullet) => ({ label: `${item.title} · ${item.organization}`, original: bullet.originalText!, text: bullet.text }))))}
          onApprove={() => {
            const next = structuredClone(draft)
            if (next.aiAssistance) next.aiAssistance.reviewed = true
            persist(next, "AI draft reviewed", () => setDraft(next))
          }} />
        <CvAssistant applicationId={applicationId} draft={draft} apply={setDraft} />
        <CvContent draft={draft} update={update} language={language} lineAssistant={(bulletId) => <LineAssistant applicationId={applicationId} draft={draft} bulletId={bulletId} apply={setDraft} />} />
      </div>}
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

/** One CV line: tick to include; AI-reworded lines show a badge with Edit and Undo, never a duplicate copy. */
function BulletRow({ bullet, label, first, last, onToggle, onEdit, onUndo, onUp, onDown, assistant }: {
  assistant?: React.ReactNode
  bullet: CvDocument["sections"][number]["items"][number]["bullets"][number]
  label: string
  first: boolean
  last: boolean
  onToggle: (value: boolean) => void
  onEdit: (text: string) => void
  onUndo: () => void
  onUp: () => void
  onDown: () => void
}) {
  const [editing, setEditing] = useState(false)
  const reworded = Boolean(bullet.originalText && bullet.originalText !== bullet.text)
  return (
    <li className="group/row grid gap-1 rounded-md px-1.5 py-1.5 hover:bg-muted/60">
      <div className="flex items-start gap-2.5">
        <Checkbox className="mt-0.5" checked={bullet.included} onCheckedChange={(value) => onToggle(Boolean(value))} aria-label={`Include ${label}`} />
        {editing ? (
          <Textarea autoFocus aria-label={`Edit ${label}`} value={bullet.text} maxLength={600} rows={3} onChange={(event) => onEdit(event.target.value)} onBlur={() => setEditing(false)} onKeyDown={(event) => { if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) setEditing(false) }} className="min-w-0 flex-1 text-[13px]" />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className={cn("min-w-0 flex-1 cursor-text text-left text-[13px] leading-5 [overflow-wrap:anywhere]", !bullet.included && "text-muted-foreground")} title="Click to edit">
            {bullet.text}
          </button>
        )}
        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100">{assistant}</span>
        <Mover label={label} upDisabled={first} downDisabled={last} onUp={onUp} onDown={onDown} />
      </div>
      {reworded && !editing ? (
        <div className="flex items-center gap-1 pl-6.5">
          <Badge variant="outline" className="px-1 py-0 text-[10px]">AI</Badge>
          <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" onClick={onUndo} title={bullet.originalText}>
            Undo AI wording
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function swap<T>(list: T[], a: number, b: number) {
  ;[list[a], list[b]] = [list[b], list[a]]
}

function CvContent({ draft, update, language, lineAssistant }: { draft: CvDocument; update: (fn: (doc: CvDocument) => void) => void; language: string; lineAssistant?: (bulletId: string) => React.ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(draft.sections.flatMap((s) => s.items.slice(0, 2).map((i) => [i.entryId, true]))))
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <div className="grid gap-1.5">
        <label htmlFor="cv-headline" className="text-xs font-semibold tracking-wide uppercase">Headline</label>
        <Input id="cv-headline" value={draft.header.headline} maxLength={160} onChange={(event) => update((doc) => void (doc.header.headline = event.target.value))} placeholder="e.g. DevSecOps engineer — cloud security and CI/CD" />
        <div className="mt-2 flex items-center justify-between">
          <label htmlFor="cv-summary" className="text-xs font-semibold tracking-wide uppercase">Summary</label>
          {draft.header.summaryOriginal !== undefined && draft.header.summaryOriginal !== draft.header.summary ? (
            <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" title={draft.header.summaryOriginal || "No summary"} onClick={() => update((doc) => {
              doc.header.summary = doc.header.summaryOriginal ?? ""
              delete doc.header.summaryOriginal
            })}>
              Undo AI wording
            </Button>
          ) : null}
        </div>
        <Textarea id="cv-summary" value={draft.header.summary} maxLength={1200} rows={3} onChange={(event) => update((doc) => void (doc.header.summary = event.target.value))} placeholder="A short paragraph about you for this job. Leave empty to hide it." className="text-[13px]" />
        <p className="text-xs text-muted-foreground">Tick the lines you want on this CV. Unticked ones are spares you can swap in. Changes here don’t touch your profile.</p>
      </div>
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
                          <BulletRow
                            key={bullet.id}
                            assistant={lineAssistant?.(bullet.id)}
                            bullet={bullet}
                            label={`${item.title}, line ${b + 1}`}
                            first={b === 0}
                            last={b === item.bullets.length - 1}
                            onToggle={(value) => update((doc) => void (doc.sections[s].items[i].bullets[b].included = value))}
                            onEdit={(text) => update((doc) => {
                              doc.sections[s].items[i].bullets[b].text = text
                              if (doc.aiAssistance) doc.aiAssistance.reviewed = false
                            })}
                            onUndo={() => update((doc) => {
                              const target = doc.sections[s].items[i].bullets[b]
                              target.text = target.originalText!
                              target.source = target.phrasingId ? "phrasing" : "fact"
                              delete target.originalText
                            })}
                            onUp={() => update((doc) => swap(doc.sections[s].items[i].bullets, b, b - 1))}
                            onDown={() => update((doc) => swap(doc.sections[s].items[i].bullets, b, b + 1))}
                          />
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
