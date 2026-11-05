"use client"

import { useState, useTransition } from "react"
import { Loader2Icon, PlusIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { suggestBulletsAction } from "@/app/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BulletSuggestion } from "@/server/profile/ai-bullets"

/** Asks the model for fact-grounded bullet drafts; the user adds the ones they like. */
export function BulletSuggestions({ input, onAdd }: { input: { kind: string; role: string; organization: string; facts: { key: string; statement: string }[]; existing: string[]; languages: string[] }; onAdd: (suggestion: BulletSuggestion) => void }) {
  const [pending, startTransition] = useTransition()
  const [suggestions, setSuggestions] = useState<BulletSuggestion[] | null>(null)
  const step = useStep(pending, AI_STEPS.bullets.length)

  const ask = () =>
    startTransition(async () => {
      const result = await suggestBulletsAction(input)
      if (!result.ok) return void toast.error(result.message)
      setSuggestions(result.bullets)
      if (!result.bullets.length) toast("No suggestion passed the fact check", { description: "Add more specific facts, then try again." })
    })

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">Draft bullets from your facts. Each one cites the facts it uses and is checked to add no numbers or skills they don’t state.</p>
        <Button size="sm" variant="outline" onClick={ask} disabled={pending || !input.facts.length}>
          {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} {suggestions ? "Suggest again" : "Suggest bullets"}
        </Button>
      </div>
      {pending ? <AiSteps steps={AI_STEPS.bullets} step={step} /> : null}
      {!pending && suggestions?.length ? (
        <ul className="grid gap-1.5">
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.language}:${suggestion.text}`} className="flex items-start gap-2 text-sm">
              <Badge variant="outline" className="mt-0.5 uppercase">
                {suggestion.language}
              </Badge>
              <span className="min-w-0 flex-1">{suggestion.text}</span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Add this bullet"
                onClick={() => {
                  onAdd(suggestion)
                  setSuggestions((current) => current?.filter((item) => item !== suggestion) ?? null)
                }}
              >
                <PlusIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
