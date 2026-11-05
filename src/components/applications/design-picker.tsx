"use client"

import Link from "next/link"
import { CheckIcon, PaletteIcon } from "lucide-react"
import { PdfThumb } from "@/components/templates/pdf-thumb"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { PRESETS, presetTokens, type DesignTokens } from "@/lib/design"
import { cn } from "@/lib/utils"

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
  const current = design ?? { ...presetTokens(template), accent }
  const customizeHref = templateRef ? `/templates/${templateRef}` : `/templates/new?from=${PRESETS[template] ? template : "classic"}`
  const options = [
    ...saved.map((item) => ({ key: item.id, name: item.name, tokens: item.tokens, active: templateRef === item.id, pick: () => onChange({ template: "custom", design: item.tokens, templateRef: item.id, accent: item.tokens.accent }) })),
    ...Object.entries(PRESETS).map(([id, preset]) => ({ key: id, name: preset.name, tokens: { ...preset.tokens, accent: design ? preset.tokens.accent : accent }, active: !templateRef && !design && template === id, pick: () => onChange({ template: id, design: null, templateRef: null }) })),
  ]
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Design">
        {options.map((option) => (
          <button key={option.key} type="button" role="radio" aria-checked={option.active} disabled={disabled} onClick={option.pick} className="group grid gap-1.5 text-left disabled:opacity-60">
            <PdfThumb tokens={option.tokens} className={cn("transition-shadow", option.active ? "ring-2 ring-foreground" : "group-hover:shadow-md")} />
            <span className="flex items-center justify-between gap-1 text-xs font-medium">
              <span className="truncate">{option.name}</span>
              {option.active ? <CheckIcon className="size-3.5 shrink-0" /> : null}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent colour">
        <span className="text-xs text-muted-foreground">Accent</span>
        {ACCENTS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={current.accent === color}
            aria-label={`Accent ${color}`}
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
            Show photo
            <span className="ml-1 text-muted-foreground">{photo.available ? "(common in FR/DE/ES; avoid for US/UK)" : "(add one in Profile first)"}</span>
          </Label>
          <Switch id="show-photo" size="sm" checked={photo.shown} disabled={disabled || !photo.available} onCheckedChange={(value) => onChange({ showPhoto: value })} />
        </div>
      ) : null}

      <Button variant="outline" size="sm" className="w-fit" nativeButton={false} render={<Link href={customizeHref} />}>
        <PaletteIcon /> Customise fonts, colours and layout
      </Button>
    </div>
  )
}
