"use client"

import { CheckIcon } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

const TEMPLATES = [
  { id: "classic", name: "Classic", hint: "Neutral sans, uppercase headings", sample: "font-sans" },
  { id: "modern", name: "Modern", hint: "Inter, accent color", sample: "font-sans" },
  { id: "serif", name: "Serif", hint: "Traditional (law, academia, finance)", sample: "font-serif" },
] as const

const ACCENTS = ["#2563eb", "#0f766e", "#7c3aed", "#be123c", "#c2410c", "#111827"]

/** Template, accent and photo choices. Every option is single-column and ATS-safe. */
export function DesignPicker({
  template,
  accent,
  onChange,
  photo,
  disabled,
}: {
  template: string
  accent: string
  onChange: (value: { template?: "classic" | "modern" | "serif"; accent?: string; showPhoto?: boolean }) => void
  photo?: { available: boolean; shown: boolean }
  disabled?: boolean
}) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Template">
        {TEMPLATES.map((item) => {
          const active = item.id === template
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange({ template: item.id })}
              className={cn("grid gap-1.5 rounded-lg border p-2 text-left transition-colors hover:border-foreground/30 disabled:opacity-60", active && "border-foreground ring-1 ring-foreground")}
            >
              {/* Miniature of the template's first lines */}
              <span className="grid gap-1 rounded bg-white p-1.5 shadow-xs ring-1 ring-border">
                <span className={cn("h-1.5 w-2/3 rounded-sm", item.id === "modern" ? "" : "bg-zinc-800")} style={item.id === "modern" ? { backgroundColor: accent } : undefined} />
                <span className="flex items-center gap-1">
                  {item.id === "modern" ? <span className="h-1.5 w-0.5 rounded-sm" style={{ backgroundColor: accent }} /> : null}
                  <span className={cn("h-1 w-1/3 rounded-sm", item.id === "modern" ? "" : "bg-zinc-500")} style={item.id === "modern" ? { backgroundColor: accent } : undefined} />
                </span>
                {item.id !== "modern" ? <span className="h-px w-full bg-zinc-300" /> : null}
                <span className="h-0.5 w-full rounded-sm bg-zinc-300" />
                <span className="h-0.5 w-5/6 rounded-sm bg-zinc-300" />
              </span>
              <span className="flex items-center justify-between text-xs font-medium">
                <span className={item.sample}>{item.name}</span>
                {active ? <CheckIcon className="size-3.5" /> : null}
              </span>
              <span className="text-[10.5px] leading-tight text-muted-foreground">{item.hint}</span>
            </button>
          )
        })}
      </div>
      {template === "modern" ? (
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Accent color">
          <span className="text-xs text-muted-foreground">Accent</span>
          {ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={accent === color}
              aria-label={`Accent ${color}`}
              disabled={disabled}
              onClick={() => onChange({ accent: color })}
              className={cn("size-5 rounded-full ring-offset-2 ring-offset-background transition-shadow", accent === color && "ring-2 ring-foreground")}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      ) : null}
      {photo ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="show-photo" className="text-xs font-normal">
            Show photo
            <span className="ml-1 text-muted-foreground">{photo.available ? "(common in FR/DE/ES; avoid for US/UK)" : "(add one in Profile first)"}</span>
          </Label>
          <Switch id="show-photo" size="sm" checked={photo.shown} disabled={disabled || !photo.available} onCheckedChange={(value) => onChange({ showPhoto: value })} />
        </div>
      ) : null}
    </div>
  )
}
