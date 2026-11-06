"use client"

import { useState, useTransition } from "react"
import { FileTextIcon, GaugeIcon, SparklesIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { reviseCvAction } from "@/app/(app)/applications/[id]/cv/actions"
import { AgentComposer, AgentThread, type AgentTurn } from "@/components/agent/agent-chat"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { CvDocument } from "@/server/documents/model"

const IDEAS = ["Make it shorter", "Fit on one page", "Stress leadership", "More technical", "Simpler words", "Lead with results"]
const STEPS = ["Reading your request", "Rewriting with your facts only", "Rendering and scoring the CV", "Fixing what the checks flag", "Keeping the best version"]
const LINE_ACTIONS = [
  { label: "Shorter", request: "Make this line shorter and punchier, same meaning." },
  { label: "Stronger verb", request: "Start this line with a stronger action verb." },
  { label: "More technical", request: "Make this line more technical and specific, using only its facts." },
  { label: "Simpler", request: "Rewrite this line in simpler, plainer words." },
  { label: "Lead with the result", request: "Rewrite this line to lead with the outcome its facts state." },
]

type Outcome = { kind: "done" | "none"; note: string; scoreBefore: number; scoreAfter: number; pages: number; rounds: number; rejected: number }

function useRevise(applicationId: string, draft: CvDocument, apply: (doc: CvDocument) => void, report?: (outcome: Outcome, request: string) => void) {
  const [pending, start] = useTransition()
  const run = (request: string, bulletId?: string) =>
    start(async () => {
      const result = await reviseCvAction(applicationId, draft, request, bulletId)
      if (!result.ok) return void toast.error(result.error)
      const { doc, changed, rejected, note, scoreBefore, scoreAfter, pages, rounds } = result.data
      const outcome: Outcome = { kind: changed ? "done" : "none", note: note || (changed ? "Done" : rejected ? "Nothing passed the fact check" : "No changes needed"), scoreBefore, scoreAfter, pages, rounds, rejected }
      if (changed) apply(doc)
      if (report) report(outcome, request)
      else if (changed) toast.success(outcome.note, { description: "Review it, then Save. Discard undoes it." })
      else toast(outcome.note)
    })
  return { pending, run }
}

/** "Ask AI" for the whole CV, as a short conversation. Changes land in the draft for review. */
export function CvAssistant({ applicationId, draft, apply }: { applicationId: string; draft: CvDocument; apply: (doc: CvDocument) => void }) {
  const [text, setText] = useState("")
  const [working, setWorking] = useState("")
  const [turns, setTurns] = useState<AgentTurn[]>([])
  const { pending, run } = useRevise(applicationId, draft, apply, (outcome, request) =>
    setTurns((current): AgentTurn[] => [
      ...current,
      {
        id: `${current.length}-${request}`,
        request,
        outcome: outcome.kind === "done" ? ("applied" as const) : ("unchanged" as const),
        summary: outcome.note,
        detail:
          outcome.kind === "done" && outcome.scoreAfter ? (
            <span className="grid gap-1">
              <span className="flex flex-wrap gap-1">
                <Badge variant="secondary" className="gap-1"><GaugeIcon className="size-3" /> {outcome.scoreBefore === outcome.scoreAfter ? `Score ${outcome.scoreAfter}` : `Score ${outcome.scoreBefore} → ${outcome.scoreAfter}`}</Badge>
                <Badge variant="secondary" className="gap-1"><FileTextIcon className="size-3" /> {outcome.pages} page{outcome.pages === 1 ? "" : "s"}</Badge>
                {outcome.rounds > 1 ? <Badge variant="secondary">{outcome.rounds} rounds</Badge> : null}
              </span>
              Not saved yet: review it, then Save.
            </span>
          ) : outcome.rejected ? `${outcome.rejected} idea(s) would have claimed things your facts don’t say.` : undefined,
      },
    ].slice(-6)),
  )
  const send = (request: string) => {
    setWorking(request.trim())
    setText("")
    run(request.trim())
  }
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
      <AgentThread turns={turns} working={pending ? working : null} steps={STEPS} />
      <AgentComposer label="Ask AI to change this CV" value={text} onChange={setText} onSend={send} busy={pending} placeholder="Ask AI to change this CV…" suggestions={turns.length ? IDEAS.slice(0, 3) : IDEAS} />
    </div>
  )
}

/** Sparkle menu on one CV line. */
export function LineAssistant({ applicationId, draft, bulletId, apply }: { applicationId: string; draft: CvDocument; bulletId: string; apply: (doc: CvDocument) => void }) {
  const { pending, run } = useRevise(applicationId, draft, apply)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" size="icon-xs" variant="ghost" aria-label="Improve this line with AI" disabled={pending} className="text-muted-foreground" />}>
        <SparklesIcon className={pending ? "cb-breathe" : undefined} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Improve this line</DropdownMenuLabel>
          {LINE_ACTIONS.map((action) => (
            <DropdownMenuItem key={action.label} onClick={() => run(action.request, bulletId)}>
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
