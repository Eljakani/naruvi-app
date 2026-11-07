"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState, useTransition } from "react"
import { ArrowDownIcon, ArrowUpIcon, LightbulbIcon, PenLineIcon } from "lucide-react"
import { toast } from "sonner"
import { generateLetterAction, saveCvEditAction, setCurrentRevisionAction, suggestLetterAction } from "@/app/(app)/applications/[id]/cv/actions"
import { CompanyResearch } from "@/components/applications/company-research"
import { DocumentStart } from "@/components/documents/document-start"
import { DEFAULT_PRESET, PRESETS, type DesignTokens } from "@/lib/design"

const LANGUAGE_NAME: Record<string, string> = { en: "English", fr: "French", es: "Spanish", de: "German" }
import { DesignPicker, type DesignChange, type SavedDesign } from "@/components/applications/design-picker"
import { AiReviewPanel } from "@/components/documents/ai-review-panel"
import type { CompanyResearch as Research } from "@/server/research/brief"
import { AI_STEPS } from "@/components/ai-progress"
import { DocumentShell, VersionsPanel, type Quality } from "@/components/documents/document-shell"
import { AgentComposer, AgentThread, type AgentTurn } from "@/components/agent/agent-chat"

const LETTER_STEPS = ["Reading your letter and request", "Rewriting in your voice", "Checking it against your facts"] as const
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { letterText, type LetterDocument } from "@/server/documents/letter"
import type { getLetterWorkspace } from "@/server/documents/service"

type Workspace = NonNullable<Awaited<ReturnType<typeof getLetterWorkspace>>>

const DECISION: Record<string, string> = {
  required: "This posting asks for a cover letter.",
  optional: "A cover letter is optional here — include one if it strengthens your application.",
  not_requested: "This posting says no cover letter is needed.",
  not_mentioned: "The posting doesn’t mention a cover letter; a short one can still help.",
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length
const isInstruction = (text: string) => /^\s*\[/.test(text)

export function LetterWorkspace({
  applicationId,
  jobTitle,
  company,
  language,
  decision,
  workspace,
  jobId,
  research,
  savedTemplates,
  startDesign = { tokens: PRESETS[DEFAULT_PRESET].tokens, name: PRESETS[DEFAULT_PRESET].name },
}: {
  applicationId: string
  jobTitle: string
  company: string
  language: string
  decision: { decision: string; evidence: string } | null
  workspace: Awaited<ReturnType<typeof getLetterWorkspace>>
  jobId: string
  research: Research | null
  savedTemplates: SavedDesign[]
  startDesign?: { tokens: DesignTokens; name: string }
}) {
  if (!workspace?.current) {
    return (
      <DocumentStart
        applicationId={applicationId}
        jobTitle={jobTitle}
        company={company}
        kind="letter"
        language={language}
        steps={AI_STEPS.letter}
        action={generateLetterAction}
        label="Draft with AI"
        icon={<PenLineIcon />}
        title="Your cover letter for this job"
        lead={`AI writes a complete letter in ${LANGUAGE_NAME[language] ?? language.toUpperCase()} using the job posting. You can review it, edit it yourself, or ask AI for changes.`}
        note={decision ? DECISION[decision.decision] : undefined}
        design={startDesign.tokens}
        designName={startDesign.name}
      />
    )
  }
  return <Editor applicationId={applicationId} jobTitle={jobTitle} company={company} language={language} workspace={workspace} jobId={jobId} research={research} savedTemplates={savedTemplates} />
}

function Editor({ applicationId, jobTitle, company, language, workspace, jobId, research, savedTemplates }: { applicationId: string; jobTitle: string; company: string; language: string; workspace: Workspace; jobId: string; research: Research | null; savedTemplates: SavedDesign[] }) {
  const router = useRouter()
  const current = workspace.current!
  const [draft, setDraft] = useState<LetterDocument>(current.content)
  const [pending, startTransition] = useTransition()
  const [asking, startAsking] = useTransition()
  const [direction, setDirection] = useState("")
  const [working, setWorking] = useState("")
  const [turns, setTurns] = useState<AgentTurn[]>([])
  const [previousDraft, setPreviousDraft] = useState<LetterDocument | null>(null)

  const ask = (request: string) => {
    const text = request.trim() || "Improve this letter"
    setWorking(text)
    setDirection("")
    startAsking(async () => {
      const result = await suggestLetterAction(applicationId, draft, text)
      if (!result.ok) {
        setTurns((current) => [...current, { id: `${current.length}`, request: text, outcome: "error" as const, summary: result.error }].slice(-6))
        return
      }
      const unchanged = result.data.aiAssistance?.status === "unchanged"
      if (!unchanged) {
        setPreviousDraft(draft)
        setDraft(result.data)
      }
      setTurns((current) => [...current, { id: `${current.length}`, request: text, outcome: unchanged ? ("unchanged" as const) : ("applied" as const), summary: unchanged ? "AI kept your wording." : "Rewritten in the editor below.", detail: unchanged ? undefined : "Not saved yet: read it, then Save. Undo brings back your version." }].slice(-6))
    })
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(current.content)
  const instruction = (current.content.paragraphs.find((p) => p.kind === "motivation")?.text ?? "").replace(/^\s*\[|\]\s*$/g, "")

  const update = (fn: (doc: LetterDocument) => void) =>
    setDraft((previous) => {
      const next = structuredClone(previous)
      fn(next)
      return next
    })

  const persist = useCallback(
    (content: LetterDocument, message?: string, onSaved?: () => void) =>
      startTransition(async () => {
        const result = await saveCvEditAction(applicationId, workspace.document.id, content)
        if (!result.ok) return void toast.error("Not saved", { description: result.error })
        onSaved?.()
        if (message) toast.success(message, { description: result.data.ready ? "Ready to send." : `Quality ${result.data.score} — see Checks for what’s left.` })
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
    setDraft(next)
    persist(next)
  }

  const total = words(letterText(draft))

  const content = (
    <fieldset disabled={asking} className="grid min-w-0 grid-cols-1 gap-5">
      <div className="grid gap-2 rounded-lg border p-3">
        <Label htmlFor="letter-notes">Your reasons for applying</Label>
        <Textarea id="letter-notes" value={draft.authorNotes ?? ""} maxLength={1500} rows={3}
          placeholder="What drew you to this role? A few words are enough."
          onChange={(event) => update((doc) => void (doc.authorNotes = event.target.value))} />
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="letter-direction">Ask AI to change it</Label>
          {previousDraft && !asking ? <Button size="xs" variant="ghost" onClick={() => { setDraft(previousDraft); setPreviousDraft(null) }}>Undo last change</Button> : null}
        </div>
        <AgentThread turns={turns} working={asking ? working : null} steps={LETTER_STEPS} />
        <AgentComposer label="What should AI change?" value={direction} onChange={setDirection} onSend={ask} busy={pending || asking}
          placeholder="For example, make it shorter and more conversational"
          suggestions={turns.length ? [] : ["Make it shorter", "More conversational", "Mention the company’s mission", "More formal"]} />
      </div>
      <AiReviewPanel assistance={draft.aiAssistance} pending={pending}
        changes={[
          ...draft.paragraphs.filter((paragraph) => paragraph.originalText).map((paragraph) => ({ label: paragraph.kind, original: paragraph.originalText!, text: paragraph.text, sources: paragraph.sourceUrls })),
          ...draft.highlights.filter((highlight) => highlight.originalText).map((highlight) => ({ label: highlight.organization, original: highlight.originalText!, text: highlight.text })),
        ]}
        onApprove={() => {
          const next = structuredClone(draft)
          if (next.aiAssistance) next.aiAssistance.reviewed = true
          persist(next, "AI draft reviewed", () => setDraft(next))
        }} />
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Edit any paragraph in your own voice.</span>
        <span className={cn("shrink-0 tabular-nums", total > 250 && "text-amber-600")}>{total} words</span>
      </div>
      <Field label="Subject">
        <Input value={draft.subject} onChange={(event) => update((doc) => void (doc.subject = event.target.value))} />
      </Field>
      <Field label="Greeting">
        <Input value={draft.salutation} onChange={(event) => update((doc) => void (doc.salutation = event.target.value))} />
      </Field>
      {draft.paragraphs.map((paragraph, index) => {
        if (paragraph.kind === "highlights") {
          return (
            <Field key={paragraph.id} label="Highlights from an earlier draft">
              <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => update((doc) => {
                doc.paragraphs = doc.paragraphs.filter((item) => item.kind !== "highlights")
                doc.highlights = []
                doc.highlightsIntro = ""
              })}>Remove highlights</Button>
              <Input aria-label="Introduction to the highlights" value={draft.highlightsIntro} onChange={(event) => update((doc) => void (doc.highlightsIntro = event.target.value))} />
              {draft.highlights.length ? (
                <ul className="grid min-w-0 grid-cols-1 gap-0.5 rounded-lg border p-1.5">
                  {draft.highlights.map((highlight, h) => (
                    <li key={highlight.id} className="group/row flex flex-wrap items-start gap-1 rounded-md hover:bg-muted/60">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 px-1.5 py-1.5">
                        <Checkbox className="mt-0.5" checked={highlight.included} onCheckedChange={(value) => update((doc) => void (doc.highlights[h].included = Boolean(value)))} />
                        <span className={cn("text-[13px] leading-5 [overflow-wrap:anywhere]", !highlight.included && "text-muted-foreground")}>
                          {highlight.text} <span className="text-muted-foreground">({highlight.organization})</span>
                        </span>
                      </label>
                      <span className="flex shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                        <button type="button" aria-label="Move up" disabled={h === 0} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => update((doc) => void ([doc.highlights[h - 1], doc.highlights[h]] = [doc.highlights[h], doc.highlights[h - 1]]))}>
                          <ArrowUpIcon className="size-3.5" />
                        </button>
                        <button type="button" aria-label="Move down" disabled={h === draft.highlights.length - 1} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => update((doc) => void ([doc.highlights[h + 1], doc.highlights[h]] = [doc.highlights[h], doc.highlights[h + 1]]))}>
                          <ArrowDownIcon className="size-3.5" />
                        </button>
                      </span>
                      {highlight.originalText ? <Textarea aria-label={`AI highlight ${h + 1}`} value={highlight.text} maxLength={600} rows={2} onChange={(event) => update((doc) => {
                        doc.highlights[h].text = event.target.value
                        if (doc.aiAssistance) doc.aiAssistance.reviewed = false
                      })} className="mb-2 w-full text-xs" /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">No approved bullet in this language backs a proven requirement yet.</p>
              )}
            </Field>
          )
        }
        const motivation = paragraph.kind === "motivation"
        const needsWords = motivation && (isInstruction(paragraph.text) || !paragraph.text.trim())
        const label = motivation ? "Why this company" : paragraph.kind === "opening" ? "Opening" : paragraph.kind === "closing" ? "Closing" : "Paragraph"
        return (
          <Field
            key={paragraph.id}
            label={label}
            badge={needsWords ? <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">your words</Badge> : null}
            hint={motivation && !isInstruction(paragraph.text) && paragraph.text.trim() ? `${words(paragraph.text)} words · 40–90 is plenty` : undefined}
          >
            {motivation && needsWords ? (
              <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <LightbulbIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>What caught your attention about {company || "the team"} or this role? Add a sentence here, or give AI a few rough notes above.</span>
              </div>
            ) : null}
            {motivation ? (
              <CompanyResearch
                mode="helper"
                applicationId={applicationId}
                jobId={jobId}
                company={company}
                language={language}
                initial={research}
                onInsert={(starter) =>
                  update((doc) => {
                    const currentText = isInstruction(doc.paragraphs[index].text) ? "" : doc.paragraphs[index].text
                    doc.paragraphs[index].text = currentText ? `${currentText.trimEnd()} ${starter}` : starter
                  })
                }
              />
            ) : null}
            <Textarea
              aria-label={label}
              rows={motivation ? 5 : 3}
              value={isInstruction(paragraph.text) ? "" : paragraph.text}
              placeholder={motivation ? instruction : undefined}
              onChange={(event) => update((doc) => {
                const paragraph = doc.paragraphs[index]
                paragraph.text = event.target.value
                paragraph.placeholder = false
                delete paragraph.originalText
                delete paragraph.factIds
                delete paragraph.sourceUrls
                if (doc.aiAssistance?.status === "applied") doc.aiAssistance.reviewed = false
              })}
              className={cn("min-h-20 text-sm leading-6", needsWords && "border-amber-300 dark:border-amber-800")}
            />
          </Field>
        )
      })}
      <Field label="Sign-off">
        <Input value={draft.signoff} onChange={(event) => update((doc) => void (doc.signoff = event.target.value))} />
      </Field>
    </fieldset>
  )

  return (
    <DocumentShell
      applicationId={applicationId}
      jobTitle={jobTitle}
      company={company}
      kind="letter"
      language={language}
      quality={current.quality as unknown as Quality}
      regenerate={null}
      downloadHref={`/api/revisions/${current.id}/pdf?contact=${workspace.contactVersion}&download=1`}
      previewUrl={`/api/revisions/${current.id}/pdf?contact=${workspace.contactVersion}`}
      pageBudget={1}
      dirty={dirty}
      pending={pending || asking}
      onSave={() => persist(draft, "Saved")}
      onDiscard={() => { setDraft(current.content); setPreviousDraft(null) }}
      design={<DesignPicker template={draft.template ?? "classic"} accent={draft.accent ?? "#2563eb"} design={draft.design} templateRef={draft.templateRef} saved={savedTemplates} onChange={applyDesign} disabled={pending || asking} />}
      versions={<VersionsPanel revisions={workspace.history} currentId={current.id} pending={pending || asking} onRestore={restore} />}
      content={content}
    />
  )
}

function Field({ label, hint, badge, children }: { label: string; hint?: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</Label>
        {badge}
        {hint ? <span className="ml-auto text-xs text-muted-foreground tabular-nums">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}
