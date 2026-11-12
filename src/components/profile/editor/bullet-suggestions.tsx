"use client"

import { useState, useTransition } from "react"
import { CheckIcon, PlusIcon, SparklesIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { suggestBulletsAction } from "@/app/[locale]/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { Presence, PresenceItem, PresenceList } from "@/components/presence"
import { Button } from "@/components/ui/button"
import type { BulletSuggestion } from "@/server/profile/ai-bullets"
import { useTranslations } from "next-intl"

type Input = { kind: string; entry: string; facts: { key: string; statement: string }[]; existing: string[]; languages: string[] }

/** Asks the model for fact-grounded bullet drafts; the user keeps the ones they like. */
export function BulletSuggestions({ input, unused, factNumber, onAdd }: { input: Input; unused: number; factNumber: (key: string) => number; onAdd: (suggestions: BulletSuggestion[]) => void }) {
  const t = useTranslations("bulletSuggestions")
  const [pending, startTransition] = useTransition()
  const [suggestions, setSuggestions] = useState<BulletSuggestion[] | null>(null)
  const step = useStep(pending, AI_STEPS.bullets.length)
  const keyOf = (suggestion: BulletSuggestion) => `${suggestion.language}:${suggestion.text}`

  const ask = () =>
    startTransition(async () => {
      const result = await suggestBulletsAction(input)
      if (!result.ok) return void toast.error(result.message)
      setSuggestions(result.bullets)
      if (!result.bullets.length) toast(t("none"), { description: t("noneBody") })
    })
  const take = (list: BulletSuggestion[]) => {
    onAdd(list)
    setSuggestions((current) => current?.filter((item) => !list.includes(item)) ?? null)
  }

  const lead = !input.facts.length
    ? t("addFact")
    : unused
      ? t("unused", { count: unused })
      : t("allUsed")

  return (
    <div className="grid gap-3 rounded-xl border border-dashed bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SparklesIcon className="size-4 shrink-0 text-brand" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{lead}</span> <span className="text-muted-foreground">{t("cite")}</span>
        </p>
        <Button size="sm" variant={unused ? "default" : "outline"} onClick={ask} disabled={pending || !input.facts.length}>
          <SparklesIcon className={pending ? "cb-breathe" : undefined} /> {suggestions ? t("again") : t("draft")}
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
                    {t("from", { count: suggestion.factKeys.length, facts: suggestion.factKeys.map((key) => factNumber(key)).filter((n) => n > 0).join(", ") })}
                  </p>
                </div>
                <Button size="icon-sm" variant="ghost" className="text-muted-foreground" aria-label={t("dismiss")} onClick={() => setSuggestions((current) => current?.filter((item) => item !== suggestion) ?? null)}>
                  <XIcon />
                </Button>
                <Button size="sm" variant="outline" aria-label={t("keepLabel")} onClick={() => take([suggestion])}>
                  <PlusIcon /> {t("keep")}
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
