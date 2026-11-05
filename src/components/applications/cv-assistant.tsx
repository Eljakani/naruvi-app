"use client"

import { useState, useTransition } from "react"
import { CheckCircle2Icon, CircleDashedIcon, FileTextIcon, GaugeIcon, SparklesIcon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { reviseCvAction } from "@/app/(app)/applications/[id]/cv/actions"
import { AiSteps, useStep } from "@/components/ai-progress"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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

function useRevise(applicationId: string, draft: CvDocument, apply: (doc: CvDocument) => void, report?: (outcome: Outcome) => void) {
  const [pending, start] = useTransition()
  const run = (request: string, bulletId?: string) =>
    start(async () => {
      const result = await reviseCvAction(applicationId, draft, request, bulletId)
      if (!result.ok) return void toast.error(result.error)
      const { doc, changed, rejected, note, scoreBefore, scoreAfter, pages, rounds } = result.data
      const outcome: Outcome = { kind: changed ? "done" : "none", note: note || (changed ? "Done" : rejected ? "Nothing passed the fact check" : "No changes needed"), scoreBefore, scoreAfter, pages, rounds, rejected }
      if (changed) apply(doc)
      if (report) report(outcome)
      else if (changed) toast.success(outcome.note, { description: "Review it, then Save. Discard undoes it." })
      else toast(outcome.note)
    })
  return { pending, run }
}

/** One line with an icon and a few chips; no wall of text. */
function OutcomeLine({ outcome, onDismiss }: { outcome: Outcome; onDismiss: () => void }) {
  const done = outcome.kind === "done"
  const Icon = done ? CheckCircle2Icon : CircleDashedIcon
  return (
    <div role="status" className="cb-step flex items-start gap-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs">
      <Icon key={outcome.note} className={cn("cb-pop mt-px size-4 shrink-0", done ? "text-primary" : "text-muted-foreground")} />
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="font-medium">{outcome.note}</span>
        {done && outcome.scoreAfter ? (
          <span className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="gap-1"><GaugeIcon className="size-3" /> {outcome.scoreBefore === outcome.scoreAfter ? `Score ${outcome.scoreAfter}` : `Score ${outcome.scoreBefore} → ${outcome.scoreAfter}`}</Badge>
            <Badge variant="secondary" className="gap-1"><FileTextIcon className="size-3" /> {outcome.pages} page{outcome.pages === 1 ? "" : "s"}</Badge>
            {outcome.rounds > 1 ? <Badge variant="secondary">{outcome.rounds} rounds</Badge> : null}
          </span>
        ) : null}
        {done ? <span className="text-muted-foreground">Not saved yet: review it, then Save.</span> : outcome.rejected ? <span className="text-muted-foreground">{outcome.rejected} idea(s) would have claimed things your facts don’t say.</span> : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded p-0.5 text-muted-foreground hover:text-foreground"><XIcon className="size-3.5" /></button>
    </div>
  )
}

/** "Ask AI" for the whole CV: free text or one tap. Changes land in the draft for review. */
export function CvAssistant({ applicationId, draft, apply }: { applicationId: string; draft: CvDocument; apply: (doc: CvDocument) => void }) {
  const [text, setText] = useState("")
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const { pending, run } = useRevise(applicationId, draft, apply, setOutcome)
  const step = useStep(pending, STEPS.length)
  return (
    <div className="grid gap-2 rounded-lg border px-3 py-2.5">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim()) run(text.trim())
          setText("")
        }}
      >
        <SparklesIcon className={pending ? "cb-breathe size-4 shrink-0" : "size-4 shrink-0"} />
        <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask AI to change this CV…" className="h-8 border-0 px-1 shadow-none focus-visible:ring-0" disabled={pending} aria-label="Ask AI to change this CV" />
        <Button type="submit" size="xs" disabled={pending || !text.trim()}>
          Apply
        </Button>
      </form>
      {pending ? (
        <AiSteps steps={STEPS} step={step} />
      ) : (
        <div className="flex flex-wrap gap-1">
          {IDEAS.map((idea) => (
            <Button key={idea} type="button" size="xs" variant="outline" className="text-muted-foreground" onClick={() => run(idea)}>
              {idea}
            </Button>
          ))}
        </div>
      )}
      {outcome && !pending ? <OutcomeLine outcome={outcome} onDismiss={() => setOutcome(null)} /> : null}
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
