"use client"

import { useState, useTransition } from "react"
import { GlobeIcon } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { enrichDraftAction } from "@/app/[locale]/(app)/profile/actions"
import { EnrichmentFacts } from "@/components/profile/enrichment-facts"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Button } from "@/components/ui/button"
import { KIND_FIELDS } from "@/lib/entry-fields"
import type { EnrichmentSuggestion } from "@/lib/enrichment"
import type { Draft, Lang } from "./draft"

const LOOKUP_KINDS = new Set<Draft["kind"]>(["experience", "education", "certification", "event"])

/**
 * Public facts about what the entry names (its organisation, certification
 * or event), looked up online. Shown apart from the person's own fields,
 * with their sources; kept or removed with the entry's next save.
 */
export function EntryEnrichmentCard({ draft, lang, patch }: { draft: Draft; lang: Lang; patch: (value: Partial<Draft>) => void }) {
  const t = useTranslations("enrichment")
  const tf = useTranslations("entryEditor.kindFields") as unknown as (key: string) => string
  const [suggestion, setSuggestion] = useState<EnrichmentSuggestion | null>(null)
  const [looking, startLooking] = useTransition()
  const kept = draft.enrichment
  if (!kept && !LOOKUP_KINDS.has(draft.kind)) return null
  const specs = KIND_FIELDS[draft.kind]
  const translated = (field: string) => Boolean(specs.find((spec) => spec.key === field)?.translated)

  const lookUp = () =>
    startLooking(async () => {
      const response = await enrichDraftAction({ kind: draft.kind, text: { ...draft.display.fr, ...draft.display.en, ...draft.display[lang] }, fields: draft.fields as Record<string, unknown>, skills: draft.skills })
      if (!response.ok) return void toast.error(response.message)
      if (!response.data.enabled) return void toast.message(t("disabled"))
      if (!response.data.suggestion?.about) return void toast.message(response.data.failed ? t("failed", { count: response.data.failed }) : t("none"))
      setSuggestion(response.data.suggestion)
    })

  /** Keeps the facts and the logo (when the entry has none) and fills fields that are empty: what was written stays. */
  const keep = (found: EnrichmentSuggestion) => {
    if (!found.about) return
    const fields = { ...draft.fields }
    const display = { en: { ...draft.display.en }, fr: { ...draft.display.fr } }
    const filled: Record<string, string> = {}
    for (const item of found.fill) {
      if (translated(item.field)) {
        if (display.en[item.field]?.trim() || display.fr[item.field]?.trim()) continue
        display[lang][item.field] = item.value
      } else {
        if (fields[item.field]) continue
        fields[item.field] = item.value
      }
      filled[item.field] = item.value
    }
    patch({ enrichment: { ...found.about, filled }, fields, display, logoPath: draft.logoPath ?? found.logoPath })
    setSuggestion(null)
    toast.success(t("kept"))
  }

  /** Removes the facts, the fields they filled (unless edited since) and restores skills they renamed. */
  const remove = () => {
    if (!kept) return
    const fields = { ...draft.fields }
    const display = { en: { ...draft.display.en }, fr: { ...draft.display.fr } }
    for (const [field, value] of Object.entries(kept.filled ?? {})) {
      if (translated(field)) for (const code of ["en", "fr"] as const) { if (display[code][field] === value) delete display[code][field] }
      else if (fields[field] === value) delete fields[field]
    }
    const original = new Map((kept.skills ?? []).map((item) => [item.to, item.from]))
    patch({ enrichment: null, fields, display, skills: draft.skills.map((skill) => original.get(skill) ?? skill) })
    toast.message(t("removed"))
  }

  const shown = kept ?? suggestion?.about ?? null
  return (
    <div className="mt-4 grid gap-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><GlobeIcon className="size-3.5" /> {t("title")}</p>
        {kept ? (
          <Button type="button" variant="ghost" size="sm" onClick={remove}>{t("remove")}</Button>
        ) : suggestion?.about ? (
          <Button type="button" variant="outline" size="sm" onClick={() => keep(suggestion)}>{t("keep")}</Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={lookUp} disabled={looking}><GlobeIcon className={looking ? "cb-breathe" : undefined} /> {looking ? t("loading") : t("lookUp")}</Button>
        )}
      </div>
      {shown && shown.subject !== "skills" ? (
        <div className="flex gap-3">
          {!kept && suggestion?.logoPath ? <EntryLogo path={suggestion.logoPath} name={shown.name} size={36} /> : null}
          <EnrichmentFacts about={shown} />
        </div>
      ) : null}
      {kept && Object.keys(kept.filled ?? {}).length ? <p className="text-xs text-muted-foreground">{t("filled", { fields: Object.keys(kept.filled).map((field) => tf(`${draft.kind}.${field}.label`)).join(", ") })}</p> : null}
      {kept?.skills?.length ? (
        <p className="text-xs text-muted-foreground">
          {t("renamed")}: {kept.skills.map((item, index) => <span key={item.from}>{index ? ", " : ""}{item.from} → <a href={item.source} target="_blank" rel="noreferrer" className="underline underline-offset-2">{item.to}</a></span>)}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{shown ? t("notYours") : t("hint")}</p>
    </div>
  )
}
