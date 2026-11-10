"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { FileTextIcon, GaugeIcon, SparklesIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { reviseCvAction } from "@/app/[locale]/(app)/applications/[id]/cv/actions"
import { AgentComposer, AgentThread, type AgentTurn } from "@/components/agent/agent-chat"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { CvDocument } from "@/server/documents/model"
import { useTranslations } from "next-intl"

// Suggestions are shown and sent in the reader's language (`cvAssistant.ideas`); the model understands either.
const IDEAS = ["shorter", "onePage", "leadership", "technical", "simpler", "results"] as const
const STEPS = ["read", "rewrite", "render", "fix", "keep"] as const
const LINE_ACTIONS: { label: "shorter" | "verb" | "technical" | "simpler" | "result"; request: string }[] = [
  { label: "shorter", request: "Make this line shorter and punchier, same meaning." },
  { label: "verb", request: "Start this line with a stronger action verb." },
  { label: "technical", request: "Make this line more technical and specific, using only its facts." },
  { label: "simpler", request: "Rewrite this line in simpler, plainer words." },
  { label: "result", request: "Rewrite this line to lead with the outcome its facts state." },
]

type Outcome = { kind: "done" | "none" | "error" | "conflict"; note: string; scoreBefore: number; scoreAfter: number; pages: number; rounds: number; rejected: number; apply?: () => void }

function useRevise(applicationId: string, draft: CvDocument, apply: (doc: CvDocument) => void, report?: (outcome: Outcome, request: string) => void) {
  const t = useTranslations("cvAssistant")
  const [pending, start] = useTransition()
  // The latest draft, so a result can tell whether you edited the CV while Naruvi was working.
  const latest = useRef(draft)
  useEffect(() => { latest.current = draft }, [draft])
  const run = (request: string, bulletId?: string) =>
    start(async () => {
      const sent = draft
      const result = await reviseCvAction(applicationId, sent, request, bulletId).catch(() => ({ ok: false as const, error: t("unreachable") }))
      if (!result.ok) {
        if (report) report({ kind: "error", note: result.error, scoreBefore: 0, scoreAfter: 0, pages: 0, rounds: 0, rejected: 0 }, request)
        else toast.error(result.error)
        return
      }
      const { doc, changed, rejected, note, scoreBefore, scoreAfter, pages, rounds } = result.data
      // Never overwrite edits you made meanwhile: ask first.
      if (changed && latest.current !== sent) {
        const outcome: Outcome = { kind: "conflict", note: t("conflict"), scoreBefore, scoreAfter, pages, rounds, rejected, apply: () => apply(doc) }
        if (report) report(outcome, request)
        else toast(t("conflictTitle"), { description: t("conflictBody"), action: { label: t("useAnyway"), onClick: () => apply(doc) } })
        return
      }
      // When nothing changed, the model's note describes an edit that didn't survive: say what actually happened instead.
      const fallback = changed ? t("done") : rejected ? t("rejectedAll") : t("noBetter")
      const outcome: Outcome = { kind: changed ? "done" : "none", note: changed ? (note || fallback) : fallback, scoreBefore, scoreAfter, pages, rounds, rejected }
      if (changed) apply(doc)
      if (report) report(outcome, request)
      else if (changed) toast.success(outcome.note, { description: t("reviewThenSave") })
      else toast(outcome.note)
    })
  return { pending, run }
}

/** Concrete instructions per check: a vague "fix it" tends to leave the CV unchanged. */
const CHECK_FIX: Record<string, string> = {
  length: "Shorten every bullet longer than 240 characters to under 200 characters. Keep its facts and numbers, drop filler words.",
  pages: "Make the CV fit the page budget: drop the weakest bullets and shorten long ones, keeping the strongest evidence for the job.",
  coverage: "Bring forward bullets that prove the job's must-haves, and reword them so the match is obvious. Use only my verified facts.",
  density: "Make the bullets denser: lead with the result, cut repetition and filler, keep the facts.",
  headline: "Write a sharper headline under my name for this job, using only my verified facts.",
}

/** One-click "Fix with Naruvi" for a failing quality check; remembers which check is being fixed. */
export function useCheckFix(applicationId: string, draft: CvDocument, apply: (doc: CvDocument) => void) {
  const { pending, run } = useRevise(applicationId, draft, apply)
  const [fixing, setFixing] = useState<string | null>(null)
  const fix = (check: { id: string; label: string; detail: string }) => {
    setFixing(check.id)
    run(`${CHECK_FIX[check.id] ?? "Fix this quality check, using only my verified facts."} (Check: ${check.label}: ${check.detail})`)
  }
  return { fixing: pending ? fixing : null, fix }
}

/** "Ask AI" for the whole CV, as a short conversation. Changes land in the draft for review. */
export function CvAssistant({ applicationId, draft, apply }: { applicationId: string; draft: CvDocument; apply: (doc: CvDocument) => void }) {
  const t = useTranslations("cvAssistant")
  const [text, setText] = useState("")
  const [working, setWorking] = useState("")
  const [turns, setTurns] = useState<AgentTurn[]>([])
  // Set below; the retry button reads it at click time.
  const sendRef = useRef<(request: string) => void>(() => {})
  const { pending, run } = useRevise(applicationId, draft, apply, (outcome, request) =>
    setTurns((current): AgentTurn[] => [
      ...current,
      {
        id: `${current.length}-${request}`,
        request,
        outcome: outcome.kind === "done" ? ("applied" as const) : outcome.kind === "error" ? ("error" as const) : ("unchanged" as const),
        summary: outcome.note,
        detail:
          outcome.kind === "done" && outcome.scoreAfter ? (
            <span className="grid gap-1">
              <span className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="gap-1"><GaugeIcon className="size-3" /> {outcome.scoreBefore === outcome.scoreAfter ? t("score", { score: outcome.scoreAfter }) : t("scoreChange", { before: outcome.scoreBefore, after: outcome.scoreAfter })}</Badge>
                <Badge variant="secondary" className="gap-1"><FileTextIcon className="size-3" /> {t("pages", { count: outcome.pages })}</Badge>
                {outcome.rounds > 1 ? <Badge variant="secondary">{t("rounds", { count: outcome.rounds })}</Badge> : null}
              </span>
              {t("notSaved")}
            </span>
          ) : outcome.rejected ? t("rejected", { count: outcome.rejected }) : undefined,
        actions: outcome.kind === "conflict" && outcome.apply ? <Button size="xs" variant="outline" onClick={outcome.apply}>{t("useVersion")}</Button> : outcome.kind === "error" ? <Button size="xs" variant="outline" onClick={() => sendRef.current(request)}>{t("tryAgain")}</Button> : undefined,
      },
    ].slice(-6)),
  )
  const send = (request: string) => {
    setWorking(request.trim())
    setText("")
    run(request.trim())
  }
  useEffect(() => { sendRef.current = send })
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
      <AgentThread turns={turns} working={pending ? working : null} steps={STEPS.map((step) => t(`steps.${step}`))} pose="tailoring-cv" intro={t("intro")} />
      <AgentComposer label={t("ask")} value={text} onChange={setText} onSend={send} busy={pending} placeholder={t("askPlaceholder")} suggestions={(turns.length ? IDEAS.slice(0, 3) : IDEAS).map((idea) => t(`ideas.${idea}`))} />
    </div>
  )
}

/** Sparkle menu on one CV line. */
export function LineAssistant({ applicationId, draft, bulletId, apply }: { applicationId: string; draft: CvDocument; bulletId: string; apply: (doc: CvDocument) => void }) {
  const t = useTranslations("cvAssistant")
  const { pending, run } = useRevise(applicationId, draft, apply)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" size="icon-xs" variant="ghost" aria-label={t("improveLine")} disabled={pending} className="text-muted-foreground" />}>
        <SparklesIcon className={pending ? "cb-breathe" : undefined} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("improveTitle")}</DropdownMenuLabel>
          {LINE_ACTIONS.map((action) => (
            <DropdownMenuItem key={action.label} onClick={() => run(action.request, bulletId)}>
              {t(`line.${action.label}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
