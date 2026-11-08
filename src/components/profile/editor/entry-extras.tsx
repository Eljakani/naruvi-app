"use client"

import { useMemo, useState, useTransition } from "react"
import { LockIcon, SearchIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { suggestEntryExtrasAction } from "@/app/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { Presence } from "@/components/presence"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { keywordLabel, keywordsIn, termsIn } from "@/server/analysis/keywords"
import { ChipInput, StringLineList, SuggestChips } from "./inputs"
import type { Draft } from "./draft"

type Patch = (value: Partial<Draft>) => void
type Extras = { skills: string[]; keywords: string[]; rules: string[] }

const lower = (list: string[]) => new Set(list.map((item) => item.trim().toLowerCase()))
const without = (list: string[], ...taken: string[][]) => {
  const seen = lower(taken.flat())
  return list.filter((item) => !seen.has(item.trim().toLowerCase()))
}

/** Guardrails people commonly need, by entry type. Offered, never added on their own. */
const RULE_PRESETS: Partial<Record<Draft["kind"], string[]>> = {
  experience: ["Don’t present freelance or contract work as a permanent job.", "Don’t claim to have led a team unless a fact says so.", "Don’t round numbers up or add results that aren’t listed."],
  project: ["Don’t present a personal project as paid client work.", "Don’t claim users or results that aren’t in the facts."],
  education: ["Don’t claim the degree before it was awarded.", "Don’t claim honours or rankings that aren’t listed."],
  certification: ["Don’t list it as current after it expires."],
  achievement: ["Don’t claim a higher placement than the one stated."],
}
const NDA_RULE = "Don’t name clients, internal systems or confidential numbers."

/** One AI call fills suggestions for both skills/keywords and the "never say" rules. */
export function useExtras(draft: Draft) {
  const [pending, startTransition] = useTransition()
  const [ai, setAi] = useState<Extras | null>(null)
  const step = useStep(pending, AI_STEPS.extras.length)
  const facts = draft.facts.map((fact) => fact.statement.trim()).filter(Boolean)
  const ask = () =>
    startTransition(async () => {
      const result = await suggestEntryExtrasAction({
        kind: draft.kind,
        role: draft.display.en.role || draft.display.fr.role || draft.title,
        organization: draft.display.en.organization || draft.display.fr.organization,
        facts,
        skills: draft.skills,
        keywords: draft.tags,
        rules: draft.doNotClaim,
        confidential: draft.confidential,
      })
      if (!result.ok) return void toast.error(result.message)
      setAi(result.data)
      if (!result.data.skills.length && !result.data.keywords.length && !result.data.rules.length) toast("Nothing new to suggest", { description: "Your tags and rules already cover the facts." })
    })
  return { pending, step, ask, ai, canAsk: facts.length > 0 }
}
export type ExtrasState = ReturnType<typeof useExtras>

export function AskExtrasButton({ extras }: { extras: ExtrasState }) {
  return (
    <Button size="sm" variant="outline" onClick={extras.ask} disabled={extras.pending || !extras.canAsk} title={extras.canAsk ? "Suggest skills, keywords and rules from your facts" : "Add a fact first"}>
      <SparklesIcon className={cn("text-brand", extras.pending && "cb-breathe")} /> {extras.ai ? "Suggest again" : "Suggest from facts"}
    </Button>
  )
}

export function SkillFields({ draft, patch, extras }: { draft: Draft; patch: Patch; extras: ExtrasState }) {
  // Instant, no AI: known skills and named tools the facts already name.
  const found = useMemo(() => {
    const lines = draft.facts.map((fact) => fact.statement)
    // Per line, so a term never spans two facts.
    return [...new Set([...keywordsIn(lines.join("\n")), ...lines.flatMap((line) => termsIn(line).map((term) => keywordLabel(term, line)))])].slice(0, 14)
  }, [draft.facts])
  const localSkills = without(found, draft.skills, draft.tags)
  const aiSkills = without(extras.ai?.skills ?? [], draft.skills, localSkills)
  const aiKeywords = without(extras.ai?.keywords ?? [], draft.tags)
  const addSkills = (items: string[]) => patch({ skills: [...draft.skills, ...without(items, draft.skills)] })
  const addTags = (items: string[]) => patch({ tags: [...draft.tags, ...without(items, draft.tags)] })

  return (
    <div className="grid gap-6">
      <Presence show={extras.pending}>
        <AiSteps steps={AI_STEPS.extras} step={extras.step} />
      </Presence>
      <div className="grid gap-2">
        <Heading label="Skills used here" count={draft.skills.length} hint="Printed on CVs. Tools and abilities this entry proves." />
        <ChipInput label="Skills used here" values={draft.skills} onChange={(skills) => patch({ skills })} placeholder="Type a skill, press Enter (e.g. Terraform, triage)" />
        <SuggestChips items={localSkills} onAdd={addSkills} source="In your facts" icon={<SearchIcon className="size-3" />} />
        <SuggestChips items={aiSkills} onAdd={addSkills} source="Naruvi" icon={<SparklesIcon className="size-3 text-brand" />} />
      </div>
      <div className="grid gap-2">
        <Heading label="Keywords" count={draft.tags.length} hint="Never printed. Topics and fields, used to match jobs." />
        <ChipInput label="Keywords" values={draft.tags} onChange={(tags) => patch({ tags })} placeholder="Type a keyword, press Enter (e.g. fintech, appsec)" />
        <SuggestChips items={aiKeywords} onAdd={addTags} source="Naruvi" icon={<SparklesIcon className="size-3 text-brand" />} />
      </div>
      <div className="grid gap-2">
        <Heading label="Proof" count={draft.evidence.filter((item) => item.trim()).length} hint="Optional. Links or documents that back this up, for you." />
        <StringLineList values={draft.evidence} onChange={(evidence) => patch({ evidence })} placeholder="https://… or the name of a document" addLabel="Add a link or document" />
      </div>
    </div>
  )
}

export function GuardrailFields({ draft, patch, extras }: { draft: Draft; patch: Patch; extras: ExtrasState }) {
  const presets = without([...(draft.confidential ? [NDA_RULE] : []), ...(RULE_PRESETS[draft.kind] ?? ["Don’t add results that aren’t in the facts."])], draft.doNotClaim)
  const aiRules = without(extras.ai?.rules ?? [], draft.doNotClaim, presets)
  const addRules = (items: string[]) => patch({ doNotClaim: [...draft.doNotClaim.filter((rule) => rule.trim()), ...items] })
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Heading label="Things not to claim" count={draft.doNotClaim.filter((rule) => rule.trim()).length} hint="CVs and letters about this entry follow these." />
        <StringLineList
          values={draft.doNotClaim}
          onChange={(doNotClaim) => patch({ doNotClaim })}
          placeholder="e.g. Don’t present this freelance work as a permanent job."
          addLabel="Add a rule"
          empty={<p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No rules yet. Pick a common one below, or write your own.</p>}
        />
        {!draft.doNotClaim.length ? (
          <Button size="sm" variant="ghost" className="w-fit text-muted-foreground" onClick={() => patch({ doNotClaim: [""] })}>
            Write a rule
          </Button>
        ) : null}
        <div className="grid gap-1.5">
          <SuggestChips items={presets} onAdd={addRules} source="Common" />
          <SuggestChips items={aiRules} onAdd={addRules} source="Naruvi" icon={<SparklesIcon className="size-3 text-brand" />} />
        </div>
      </div>
      <label
        htmlFor="entry-nda"
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
          draft.confidential ? "border-amber-500/40 bg-amber-500/8" : "hover:bg-muted/40",
        )}
      >
        <span className={cn("grid size-9 shrink-0 place-content-center rounded-lg transition-colors", draft.confidential ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground")}>
          <LockIcon className="size-4" />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-medium">Under NDA</span>
          <span className="text-xs text-muted-foreground">
            {draft.confidential ? "CVs keep it high-level: no client names, internal systems or confidential numbers." : "Turn on if you can’t name clients, systems or numbers."}
          </span>
        </span>
        <Switch id="entry-nda" checked={draft.confidential} onCheckedChange={(value) => patch({ confidential: value })} />
      </label>
    </div>
  )
}

function Heading({ label, count, hint }: { label: string; count: number; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-sm font-medium">{label}</span>
      {count ? <span className="text-xs text-muted-foreground tabular-nums">{count}</span> : null}
      <span className="w-full text-xs text-muted-foreground sm:ms-auto sm:w-auto">{hint}</span>
    </div>
  )
}
