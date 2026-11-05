"use client"

import { useState, useTransition } from "react"
import { SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { reviseCvAction } from "@/app/(app)/applications/[id]/cv/actions"
import { AiSteps, useStep } from "@/components/ai-progress"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { CvDocument } from "@/server/documents/model"

const IDEAS = ["Make it shorter", "Fit on one page", "Stress leadership", "More technical", "Simpler words", "Lead with results"]
const STEPS = ["Reading your request", "Rewriting with your facts only", "Checking every change"]
const LINE_ACTIONS = [
  { label: "Shorter", request: "Make this line shorter and punchier, same meaning." },
  { label: "Stronger verb", request: "Start this line with a stronger action verb." },
  { label: "More technical", request: "Make this line more technical and specific, using only its facts." },
  { label: "Simpler", request: "Rewrite this line in simpler, plainer words." },
  { label: "Lead with the result", request: "Rewrite this line to lead with the outcome its facts state." },
]

function useRevise(applicationId: string, draft: CvDocument, apply: (doc: CvDocument) => void) {
  const [pending, start] = useTransition()
  const run = (request: string, bulletId?: string) =>
    start(async () => {
      const result = await reviseCvAction(applicationId, draft, request, bulletId)
      if (!result.ok) return void toast.error(result.error)
      const { doc, changed, rejected, note } = result.data
      if (!changed) return void toast(rejected ? "Nothing passed the fact check" : "No changes needed", { description: rejected ? `${rejected} suggestion(s) would have added claims your facts don’t support.` : note || undefined })
      apply(doc)
      toast.success(note || `${changed} change${changed === 1 ? "" : "s"} made`, { description: `Review and press Save. Discard undoes everything.${rejected ? ` ${rejected} suggestion(s) were dropped by the fact check.` : ""}` })
    })
  return { pending, run }
}

/** "Ask AI" for the whole CV: free text or one tap. Changes land in the draft for review. */
export function CvAssistant({ applicationId, draft, apply }: { applicationId: string; draft: CvDocument; apply: (doc: CvDocument) => void }) {
  const [text, setText] = useState("")
  const { pending, run } = useRevise(applicationId, draft, apply)
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
