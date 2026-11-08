"use client"

import { useState, useTransition } from "react"
import { CheckIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { suggestBulletsAction } from "@/app/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { Presence, PresenceItem, PresenceList } from "@/components/presence"
import { Button } from "@/components/ui/button"
import type { BulletSuggestion } from "@/server/profile/ai-bullets"

type Input = { kind: string; role: string; organization: string; facts: { key: string; statement: string }[]; existing: string[]; languages: string[] }

/** Asks the model for fact-grounded bullet drafts; the user keeps the ones they like. */
export function BulletSuggestions({ input, unused, factNumber, onAdd }: { input: Input; unused: number; factNumber: (key: string) => number; onAdd: (suggestions: BulletSuggestion[]) => void }) {
  const [pending, startTransition] = useTransition()
  const [suggestions, setSuggestions] = useState<BulletSuggestion[] | null>(null)
  const step = useStep(pending, AI_STEPS.bullets.length)
  const keyOf = (suggestion: BulletSuggestion) => `${suggestion.language}:${suggestion.text}`

  const ask = () =>
    startTransition(async () => {
      const result = await suggestBulletsAction(input)
      if (!result.ok) return void toast.error(result.message)
      setSuggestions(result.bullets)
      if (!result.bullets.length) toast("No suggestion passed the fact check", { description: "Add more specific facts, then try again." })
    })
  const take = (list: BulletSuggestion[]) => {
    onAdd(list)
    setSuggestions((current) => current?.filter((item) => !list.includes(item)) ?? null)
  }

  const lead = !input.facts.length
    ? "Add a fact first; every CV line is drafted from one."
    : unused
      ? `${unused} fact${unused === 1 ? " isn’t" : "s aren’t"} on a CV line yet.`
      : "Every fact is on a CV line. Draft more variants if you like."

  return (
    <div className="grid gap-3 rounded-xl border border-dashed bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="size-4 shrink-0 text-brand" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{lead}</span> <span className="text-muted-foreground">Drafts cite their facts and can’t add numbers or skills.</span>
        </p>
        <Button size="sm" variant={unused ? "default" : "outline"} onClick={ask} disabled={pending || !input.facts.length}>
          <SparklesIcon className={pending ? "cb-breathe" : undefined} /> {suggestions ? "Draft again" : "Draft CV lines"}
        </Button>
      </div>
      <Presence show={pending}>
        <AiSteps steps={AI_STEPS.bullets} step={step} className="px-1 pb-1" />
      </Presence>
      <Presence show={!pending && Boolean(suggestions?.length)}>
        <div className="grid gap-1.5">
          <PresenceList>
            {suggestions?.map((suggestion) => (
              <PresenceItem key={keyOf(suggestion)} className="group/s flex items-start gap-2 rounded-lg border bg-background p-2.5 ps-3">
                <span className="mt-0.5 rounded bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground uppercase">{suggestion.language}</span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="text-sm text-pretty">{suggestion.text}</p>
                  <p className="text-[11px] text-muted-foreground">
                    From fact{suggestion.factKeys.length === 1 ? "" : "s"} {suggestion.factKeys.map((key) => factNumber(key)).filter((n) => n > 0).join(", ")}
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label="Dismiss this draft" onClick={() => setSuggestions((current) => current?.filter((item) => item !== suggestion) ?? null)}>
                  <XIcon />
                </Button>
                <Button size="sm" variant="outline" aria-label="Keep this draft" onClick={() => take([suggestion])}>
                  <PlusIcon /> Keep
                </Button>
              </PresenceItem>
            ))}
          </PresenceList>
          {(suggestions?.length ?? 0) > 1 ? (
            <Button size="sm" variant="ghost" className="w-fit" onClick={() => take(suggestions ?? [])}>
              <CheckIcon /> Keep all {suggestions?.length}
            </Button>
          ) : null}
        </div>
      </Presence>
    </div>
  )
}
