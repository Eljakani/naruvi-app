"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState, useTransition } from "react"
import { ArrowDownIcon, ArrowUpIcon, LightbulbIcon, PenLineIcon } from "lucide-react"
import { toast } from "sonner"
import { generateLetterAction, saveCvEditAction, setCurrentRevisionAction, suggestLetterAction } from "@/app/[locale]/(app)/applications/[id]/cv/actions"
import { CompanyResearch } from "@/components/applications/company-research"
import { DocumentStart } from "@/components/documents/document-start"
import { DEFAULT_PRESET, PRESETS, type DesignTokens } from "@/lib/design"

import { DesignPicker, type DesignChange, type SavedDesign } from "@/components/applications/design-picker"
import { AiReviewPanel } from "@/components/documents/ai-review-panel"
import type { CompanyResearch as Research } from "@/server/research/brief"
import { AI_STEPS } from "@/components/ai-progress"
import { DocumentShell, VersionsPanel, type Quality } from "@/components/documents/document-shell"
import { AgentComposer, AgentThread, type AgentTurn } from "@/components/agent/agent-chat"

const LETTER_STEPS = ["read", "rewrite", "check"] as const
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { letterText, type LetterDocument } from "@/server/documents/letter"
import type { getLetterWorkspace } from "@/server/documents/service"
import { useLocale, useTranslations } from "next-intl"
import { languageName } from "@/i18n/config"

type Workspace = NonNullable<Awaited<ReturnType<typeof getLetterWorkspace>>>

const DECISIONS = ["required", "optional", "not_requested", "not_mentioned"] as const

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
  const t = useTranslations("letterWorkspace")
  const locale = useLocale()
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
        label={t("draft")}
        icon={<PenLineIcon />}
        title={t("title")}
        lead={t("lead", { language: languageName(language, locale) })}
        note={decision && (DECISIONS as readonly string[]).includes(decision.decision) ? t(`decision.${decision.decision as (typeof DECISIONS)[number]}`) : undefined}
        design={startDesign.tokens}
        designName={startDesign.name}
      />
    )
  }
  return <Editor applicationId={applicationId} jobTitle={jobTitle} company={company} language={language} workspace={workspace} jobId={jobId} research={research} savedTemplates={savedTemplates} />
}

function Editor({ applicationId, jobTitle, company, language, workspace, jobId, research, savedTemplates }: { applicationId: string; jobTitle: string; company: string; language: string; workspace: Workspace; jobId: string; research: Research | null; savedTemplates: SavedDesign[] }) {
  const t = useTranslations("letterWorkspace")
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
    const text = request.trim() || t("improve")
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
      setTurns((current) => [...current, { id: `${current.length}`, request: text, outcome: unchanged ? ("unchanged" as const) : ("applied" as const), summary: unchanged ? t("kept") : t("rewritten"), detail: unchanged ? undefined : t("notSavedYet") }].slice(-6))
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
        if (!result.ok) return void toast.error(t("notSaved"), { description: result.error })
        onSaved?.()
        if (message) toast.success(message, { description: result.data.ready ? t("readyToSend") : t("quality", { score: result.data.score }) })
        router.refresh()
      }),
    [applicationId, router, workspace.document.id, t],
  )

  const restore = (revisionId: string) =>
    startTransition(async () => {
      const result = await setCurrentRevisionAction(applicationId, workspace.document.id, revisionId)
      if (!result.ok) return void toast.error(result.error)
      toast.success(t("restored"))
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
        <Label htmlFor="letter-notes">{t("reasons")}</Label>
        <Textarea id="letter-notes" value={draft.authorNotes ?? ""} maxLength={1500} rows={3}
          placeholder={t("reasonsPlaceholder")}
          onChange={(event) => update((doc) => void (doc.authorNotes = event.target.value))} />
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="letter-direction">{t("askAi")}</Label>
          {previousDraft && !asking ? <Button size="xs" variant="ghost" onClick={() => { setDraft(previousDraft); setPreviousDraft(null) }}>{t("undoLast")}</Button> : null}
        </div>
        <AgentThread turns={turns} working={asking ? working : null} steps={LETTER_STEPS.map((step) => t(`steps.${step}`))} pose="writing-letter" intro={t("intro")} />
        <AgentComposer label={t("composer")} value={direction} onChange={setDirection} onSend={ask} busy={pending || asking}
          placeholder={t("composerPlaceholder")}
          suggestions={turns.length ? [] : [t("ideas.shorter"), t("ideas.conversational"), t("ideas.mission"), t("ideas.formal")]} />
      </div>
      <AiReviewPanel assistance={draft.aiAssistance} pending={pending}
        changes={[
          ...draft.paragraphs.filter((paragraph) => paragraph.originalText).map((paragraph) => ({ label: t(`kinds.${paragraph.kind}`), original: paragraph.originalText!, text: paragraph.text, sources: paragraph.sourceUrls })),
          ...draft.highlights.filter((highlight) => highlight.originalText).map((highlight) => ({ label: highlight.organization, original: highlight.originalText!, text: highlight.text })),
        ]}
        onApprove={() => {
          const next = structuredClone(draft)
          if (next.aiAssistance) next.aiAssistance.reviewed = true
          persist(next, t("reviewed"), () => setDraft(next))
        }} />
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{t("editHint")}</span>
        <span className={cn("shrink-0 tabular-nums", total > 250 && "text-amber-600")}>{t("words", { count: total })}</span>
      </div>
      <Field label={t("subject")}>
        <Input value={draft.subject} onChange={(event) => update((doc) => void (doc.subject = event.target.value))} />
      </Field>
      <Field label={t("greeting")}>
        <Input value={draft.salutation} onChange={(event) => update((doc) => void (doc.salutation = event.target.value))} />
      </Field>
      {draft.paragraphs.map((paragraph, index) => {
        if (paragraph.kind === "highlights") {
          return (
            <Field key={paragraph.id} label={t("highlights")}>
              <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => update((doc) => {
                doc.paragraphs = doc.paragraphs.filter((item) => item.kind !== "highlights")
                doc.highlights = []
                doc.highlightsIntro = ""
              })}>{t("removeHighlights")}</Button>
              <Input aria-label={t("highlightsIntro")} value={draft.highlightsIntro} onChange={(event) => update((doc) => void (doc.highlightsIntro = event.target.value))} />
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
                        <button type="button" aria-label={t("moveUp")} disabled={h === 0} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => update((doc) => void ([doc.highlights[h - 1], doc.highlights[h]] = [doc.highlights[h], doc.highlights[h - 1]]))}>
                          <ArrowUpIcon className="size-3.5" />
                        </button>
                        <button type="button" aria-label={t("moveDown")} disabled={h === draft.highlights.length - 1} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" onClick={() => update((doc) => void ([doc.highlights[h + 1], doc.highlights[h]] = [doc.highlights[h], doc.highlights[h + 1]]))}>
                          <ArrowDownIcon className="size-3.5" />
                        </button>
                      </span>
                      {highlight.originalText ? <Textarea aria-label={t("aiHighlight", { n: h + 1 })} value={highlight.text} maxLength={600} rows={2} onChange={(event) => update((doc) => {
                        doc.highlights[h].text = event.target.value
                        if (doc.aiAssistance) doc.aiAssistance.reviewed = false
                      })} className="mb-2 w-full text-xs" /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">{t("noHighlights")}</p>
              )}
            </Field>
          )
        }
        const motivation = paragraph.kind === "motivation"
        const needsWords = motivation && (isInstruction(paragraph.text) || !paragraph.text.trim())
        const label = motivation ? t("why") : paragraph.kind === "opening" ? t("kinds.opening") : paragraph.kind === "closing" ? t("kinds.closing") : t("kinds.custom")
        return (
          <Field
            key={paragraph.id}
            label={label}
            badge={needsWords ? <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">{t("yourWords")}</Badge> : null}
            hint={motivation && !isInstruction(paragraph.text) && paragraph.text.trim() ? t("motivationWords", { count: words(paragraph.text) }) : undefined}
          >
            {motivation && needsWords ? (
              <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <LightbulbIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>{t("whatCaught", { company: company || t("theTeam") })}</span>
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
      <Field label={t("signoff")}>
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
      onSave={() => persist(draft, t("saved"))}
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
        {hint ? <span className="ms-auto text-xs text-muted-foreground tabular-nums">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}
