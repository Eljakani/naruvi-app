"use client"

import { GlobeIcon, LanguagesIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { DateRangeField, MonthField } from "@/components/profile/editor/date-range-field"
import type { Draft, Lang } from "@/components/profile/editor/draft"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { fromMonthYear, fromRange, KIND_FIELDS, OPTIONS, optionLabel, toRange, type DatesValue, type FieldSpec } from "@/lib/entry-fields"
import { cn } from "@/lib/utils"

/**
 * The entry's own fields, by kind. Text fields are written in the language
 * being edited; the rest (company, dates, issuer…) are shared by every CV.
 */
export function KindFields({ draft, lang, patch }: { draft: Draft; lang: Lang; patch: (value: Partial<Draft>) => void }) {
  const tk = useTranslations("entryEditor.kindFields")
  // Keys are built from the kind's field list (src/lib/entry-fields.ts), so they can't be checked statically.
  const t = tk as unknown as ((key: string) => string) & { has: (key: string) => boolean }
  const label = (spec: FieldSpec) => t(`${draft.kind}.${spec.key}.label`)
  const placeholder = (spec: FieldSpec) => (t.has(`${draft.kind}.${spec.key}.placeholder`) ? t(`${draft.kind}.${spec.key}.placeholder`) : undefined)
  const setText = (key: string, value: string) => patch({ display: { ...draft.display, [lang]: { ...draft.display[lang], [key]: value } } })
  const setField = (key: string, value: unknown) => {
    const fields = { ...draft.fields } as Record<string, unknown>
    if (value === undefined || value === "") delete fields[key]
    else fields[key] = value
    patch({ fields: fields as Draft["fields"] })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {KIND_FIELDS[draft.kind].map((spec) => {
        const id = `${draft.kind}-${spec.key}-${spec.translated ? lang : "all"}`
        const wide = spec.wide || spec.type === "dates" || (spec.type === "select" && (OPTIONS[spec.options!] as readonly string[]).length > 4)
        let control: React.ReactNode
        if (spec.type === "dates") {
          control = <DateRangeField lang={lang} label={label(spec)} value={toRange(draft.fields[spec.key] as DatesValue | undefined)} onChange={(range) => setField(spec.key, range.start || range.end ? fromRange(range) : undefined)} />
        } else if (spec.type === "month") {
          const value = toRange({ start: draft.fields[spec.key] as string | undefined }).start
          control = <MonthField lang={lang} label={label(spec)} value={value} onChange={(next) => setField(spec.key, fromMonthYear(next))} />
        } else if (spec.type === "select") {
          control = <OptionPicker id={id} label={label(spec)} options={OPTIONS[spec.options!]} value={(draft.fields[spec.key] as string | undefined) ?? ""} onChange={(value) => setField(spec.key, value)} />
        } else {
          const value = spec.translated ? (draft.display[lang][spec.key] ?? "") : ((draft.fields[spec.key] as string | undefined) ?? "")
          control = (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={id}>
                  {label(spec)}
                  {spec.required ? <span className="text-muted-foreground" aria-hidden> *</span> : null}
                </Label>
                {spec.translated ? (draft.translations[lang]?.[spec.key] && draft.translations[lang][spec.key].text === value ? <AutoBadge /> : null) : <SharedHint />}
              </div>
              <Input id={id} aria-required={spec.required || undefined} type={spec.type === "url" ? "url" : "text"} inputMode={spec.type === "url" ? "url" : undefined} value={value} placeholder={placeholder(spec)} onChange={(event) => (spec.translated ? setText(spec.key, event.target.value) : setField(spec.key, event.target.value))} />
            </div>
          )
        }
        return <div key={spec.key} className={cn(wide && "sm:col-span-2")}>{control}</div>
      })}
    </div>
  )
}

/** Same in every language: shown on fields that aren't translated. */
function SharedHint() {
  const t = useTranslations("entryEditor.kindFields")
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={t("sharedHint")}>
      <GlobeIcon className="size-3" /> {t("shared")}
    </span>
  )
}

function OptionPicker({ id, label, options, value, onChange }: { id: string; label: string; options: readonly string[]; value: string; onChange: (value: string) => void }) {
  const locale = useLocale()
  return (
    <div className="grid gap-2">
      <span id={id} className="text-sm font-medium">{label}</span>
      <ToggleGroup aria-labelledby={id} value={value ? [value] : []} onValueChange={(next) => onChange(next.at(-1) ?? "")} variant="outline" size="sm" spacing={1} className="flex flex-wrap justify-start">
        {options.map((option) => (
          <ToggleGroupItem key={option} value={option}>{optionLabel(option, locale)}</ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** Marks text Naruvi translated; editing it makes it yours, and Naruvi stops updating it. */
export function AutoBadge() {
  const t = useTranslations("entryEditor")
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground" title={t("translation.autoHint")}>
      <LanguagesIcon className="size-3" /> {t("translation.auto")}
    </span>
  )
}
