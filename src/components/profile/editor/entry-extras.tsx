"use client"

import { describeEntry } from "@/lib/entry-fields"
import { useMemo, useState, useTransition } from "react"
import { LockIcon, SearchIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { suggestEntryExtrasAction } from "@/app/[locale]/(app)/profile/actions"
import { AI_STEPS, AiSteps, useStep } from "@/components/ai-progress"
import { Presence } from "@/components/presence"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { keywordLabel, keywordsIn, termsIn } from "@/server/analysis/keywords"
import { ChipInput, StringLineList, SuggestChips } from "./inputs"
import type { Draft } from "./draft"
import { useTranslations } from "next-intl"

type Patch = (value: Partial<Draft>) => void
type Extras = { skills: string[]; keywords: string[]; rules: string[] }

const lower = (list: string[]) => new Set(list.map((item) => item.trim().toLowerCase()))
const without = (list: string[], ...taken: string[][]) => {
  const seen = lower(taken.flat())
  return list.filter((item) => !seen.has(item.trim().toLowerCase()))
}

/** Guardrails people commonly need, by entry type. Offered, never added on their own. */
const RULE_PRESETS: Partial<Record<Draft["kind"], string[]>> = {
  experience: ["experience.0", "experience.1", "experience.2"],
  project: ["project.0", "project.1"],
  education: ["education.0", "education.1"],
  certification: ["certification.0"],
  achievement: ["achievement.0"],
}
const NDA_RULE = "nda"

/** One AI call fills suggestions for both skills/keywords and the "never say" rules. */
export function useExtras(draft: Draft) {
  const t = useTranslations("entryExtras")
  const [pending, startTransition] = useTransition()
  const [ai, setAi] = useState<Extras | null>(null)
  const step = useStep(pending, AI_STEPS.extras.length)
  const facts = draft.facts.map((fact) => fact.statement.trim()).filter(Boolean)
  const ask = () =>
    startTransition(async () => {
      const result = await suggestEntryExtrasAction({
        kind: draft.kind,
        entry: describeEntry(draft, "en"),
        facts,
        skills: draft.skills,
        keywords: draft.tags,
        rules: draft.doNotClaim,
        confidential: draft.confidential,
      })
      if (!result.ok) return void toast.error(result.message)
      setAi(result.data)
      if (!result.data.skills.length && !result.data.keywords.length && !result.data.rules.length) toast(t("nothingNew"), { description: t("nothingNewBody") })
    })
  return { pending, step, ask, ai, canAsk: facts.length > 0 }
}
export type ExtrasState = ReturnType<typeof useExtras>

export function AskExtrasButton({ extras }: { extras: ExtrasState }) {
  const t = useTranslations("entryExtras")
  return (
    <Button size="sm" variant="outline" onClick={extras.ask} disabled={extras.pending || !extras.canAsk} title={extras.canAsk ? t("askHint") : t("addFactFirst")}>
      <SparklesIcon className={cn("text-brand", extras.pending && "cb-breathe")} /> {extras.ai ? t("again") : t("suggest")}
    </Button>
  )
}

export function SkillFields({ draft, patch, extras }: { draft: Draft; patch: Patch; extras: ExtrasState }) {
  const t = useTranslations("entryExtras")
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
        <Heading label={t("skills")} count={draft.skills.length} hint={t("skillsHint")} />
        <ChipInput label={t("skills")} values={draft.skills} onChange={(skills) => patch({ skills })} placeholder={t("skillsPlaceholder")} />
        <SuggestChips items={localSkills} onAdd={addSkills} source={t("inFacts")} icon={<SearchIcon className="size-3" />} />
        <SuggestChips items={aiSkills} onAdd={addSkills} source="Naruvi" icon={<SparklesIcon className="size-3 text-brand" />} />
      </div>
      <div className="grid gap-2">
        <Heading label={t("keywords")} count={draft.tags.length} hint={t("keywordsHint")} />
        <ChipInput label={t("keywords")} values={draft.tags} onChange={(tags) => patch({ tags })} placeholder={t("keywordsPlaceholder")} />
        <SuggestChips items={aiKeywords} onAdd={addTags} source="Naruvi" icon={<SparklesIcon className="size-3 text-brand" />} />
      </div>
      <div className="grid gap-2">
        <Heading label={t("proof")} count={draft.evidence.filter((item) => item.trim()).length} hint={t("proofHint")} />
        <StringLineList values={draft.evidence} onChange={(evidence) => patch({ evidence })} placeholder={t("proofPlaceholder")} addLabel={t("proofAdd")} />
      </div>
    </div>
  )
}

export function GuardrailFields({ draft, patch, extras }: { draft: Draft; patch: Patch; extras: ExtrasState }) {
  const t = useTranslations("entryExtras")
  const presets = without([...(draft.confidential ? [NDA_RULE] : []), ...(RULE_PRESETS[draft.kind] ?? ["general"])].map((key) => t(`rules.${key}` as never) as string), draft.doNotClaim)
  const aiRules = without(extras.ai?.rules ?? [], draft.doNotClaim, presets)
  const addRules = (items: string[]) => patch({ doNotClaim: [...draft.doNotClaim.filter((rule) => rule.trim()), ...items] })
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Heading label={t("notClaim")} count={draft.doNotClaim.filter((rule) => rule.trim()).length} hint={t("notClaimHint")} />
        <StringLineList
          values={draft.doNotClaim}
          onChange={(doNotClaim) => patch({ doNotClaim })}
          placeholder={t("rulePlaceholder")}
          addLabel={t("addRule")}
          empty={<p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{t("noRules")}</p>}
        />
        {!draft.doNotClaim.length ? (
          <Button size="sm" variant="ghost" className="w-fit text-muted-foreground" onClick={() => patch({ doNotClaim: [""] })}>
            {t("writeRule")}
          </Button>
        ) : null}
        <div className="grid gap-1.5">
          <SuggestChips items={presets} onAdd={addRules} source={t("common")} />
          <SuggestChips items={aiRules} onAdd={addRules} source="Naruvi" icon={<SparklesIcon className="size-3 text-brand" />} />
        </div>
      </div>
      <label
        htmlFor="entry-nda"
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
          draft.confidential ? "border-warning/40 bg-warning/8" : "hover:bg-muted/40",
        )}
      >
        <span className={cn("grid size-9 shrink-0 place-content-center rounded-lg transition-colors", draft.confidential ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
          <LockIcon className="size-4" />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-sm font-medium">{t("nda")}</span>
          <span className="text-xs text-muted-foreground">
            {draft.confidential ? t("ndaOn") : t("ndaOff")}
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
