"use client"

import Link from "next/link"
import { useState } from "react"
import { CheckIcon, PaletteIcon } from "lucide-react"
import { PdfThumb } from "@/components/templates/pdf-thumb"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ALL_PRESETS, DEFAULT_PRESET, PRESET_TAGS, PRESETS, presetTokens, type DesignTokens, type PresetTag } from "@/lib/design"
import { designInsights } from "@/lib/design-insights"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

const ACCENTS = ["#2563eb", "#0f766e", "#4338ca", "#7c3aed", "#be123c", "#c2410c", "#1e3a5f", "#111827"]

export type DesignChange = { template?: string; design?: DesignTokens | null; templateRef?: string | null; accent?: string; showPhoto?: boolean }
export type SavedDesign = { id: string; name: string; tokens: DesignTokens }

/** Pick a design (built-in or your own), its accent colour and the photo. Thumbnails show your own CV. */
export function DesignPicker({
  template,
  accent,
  design,
  templateRef,
  saved = [],
  onChange,
  photo,
  disabled,
}: {
  template: string
  accent: string
  design?: DesignTokens
  templateRef?: string
  saved?: SavedDesign[]
  onChange: (value: DesignChange) => void
  photo?: { available: boolean; shown: boolean }
  disabled?: boolean
}) {
  const t = useTranslations("designPicker")
  const ti = useTranslations("designInsights")
  const [tag, setTag] = useState<PresetTag | "all">("all")
  const current = design ?? { ...presetTokens(template), accent }
  const customizeHref = templateRef ? `/templates/${templateRef}` : `/templates/new?from=${ALL_PRESETS[template] ? template : DEFAULT_PRESET}`
  const options = [
    // A design fitted or suggested for this CV belongs to no template: list it so the selection is visible.
    ...(design && !templateRef ? [{ key: "adjusted", name: t("adjusted"), tokens: design, tags: null as readonly PresetTag[] | null, active: true, pick: () => {} }] : []),
    ...saved.map((item) => ({ key: item.id, name: item.name, tokens: item.tokens, tags: null as readonly PresetTag[] | null, active: templateRef === item.id, pick: () => onChange({ template: "custom", design: item.tokens, templateRef: item.id, accent: item.tokens.accent }) })),
    // A document on an earlier built-in style keeps it listed so it stays selected.
    ...Object.entries({ ...(!PRESETS[template] && ALL_PRESETS[template] && !design ? { [template]: ALL_PRESETS[template] } : {}), ...PRESETS }).map(([id, preset]) => {
      const active = !templateRef && !design && template === id
      // Each theme brings its own colour; the current one keeps the colour already chosen.
      return { key: id, name: preset.name, tags: preset.tags ?? [], tokens: { ...preset.tokens, accent: active ? accent : preset.tokens.accent }, active, pick: () => onChange({ template: id, design: null, templateRef: null, accent: preset.tokens.accent }) }
    }),
  ]
  // Your own designs and the one in use stay listed whatever the filter.
  const shown = options.filter((option) => tag === "all" || option.active || !option.tags || option.tags.includes(tag))
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("filter")}>
        {(["all", ...PRESET_TAGS] as const).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={tag === value} onClick={() => setTag(value)} className={cn("rounded-full border px-2 py-0.5 text-xs transition-colors", tag === value ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
            {t(`tags.${value}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t("design")}>
        {shown.map((option) => (
          <button key={option.key} type="button" role="radio" aria-checked={option.active} disabled={disabled} onClick={option.pick} className="group grid gap-1.5 text-start disabled:opacity-60">
            <PdfThumb tokens={option.tokens} className={cn("transition-shadow", option.active ? "ring-2 ring-foreground" : "group-hover:shadow-md")} />
            <span className="flex items-center justify-between gap-1 text-xs font-medium">
              <span className="truncate">{option.name}</span>
              {option.active ? <CheckIcon className="size-3.5 shrink-0" /> : null}
            </span>
            <span className="-mt-1 truncate text-[11px] text-muted-foreground">{ti(`ats.${designInsights(option.tokens).ats}`)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("accentLabel")}>
        <span className="text-xs text-muted-foreground">{t("accent")}</span>
        {ACCENTS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={current.accent === color}
            aria-label={t("accentColor", { color })}
            disabled={disabled}
            onClick={() => onChange(design ? { design: { ...design, accent: color }, accent: color } : { accent: color })}
            className={cn("size-5 rounded-full ring-offset-2 ring-offset-background transition-shadow", current.accent === color && "ring-2 ring-foreground")}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {photo ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="show-photo" className="text-xs font-normal">
            {t("photo")}
            <span className="ms-1 text-muted-foreground">{photo.available ? t("photoHint") : t("photoMissing")}</span>
          </Label>
          <Switch id="show-photo" size="sm" checked={photo.shown} disabled={disabled || !photo.available} onCheckedChange={(value) => onChange({ showPhoto: value })} />
        </div>
      ) : null}

      <Button variant="outline" size="sm" className="w-fit" nativeButton={false} render={<Link href={customizeHref} />}>
        <PaletteIcon /> {t("customise")}
      </Button>
    </div>
  )
}
