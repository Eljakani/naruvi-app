"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

export const LANGUAGE_NAMES: Record<string, string> = { en: "English", fr: "Français" }

/**
 * One switch for "which language am I writing in", instead of a field per
 * language. The dot shows whether that language is filled in yet.
 */
export function LanguageSwitch<L extends string>({ value, onChange, languages, filled, className, label = "Language" }: { value: L; onChange: (value: L) => void; languages: readonly L[]; filled: (language: L) => boolean; className?: string; label?: string }) {
  return (
    <ToggleGroup value={[value]} onValueChange={(next) => next[0] && onChange(next[0] as L)} variant="outline" size="sm" aria-label={label} className={cn("bg-background", className)}>
      {languages.map((code) => {
        const done = filled(code)
        return (
          <ToggleGroupItem key={code} value={code} className="gap-1.5 px-2.5 text-xs aria-pressed:bg-muted aria-pressed:font-semibold" title={`${LANGUAGE_NAMES[code] ?? code}${done ? "" : " (not filled in yet)"}`}>
            <span className={cn("size-1.5 rounded-full transition-colors", done ? "bg-primary" : "bg-muted-foreground/30")} aria-hidden />
            {LANGUAGE_NAMES[code] ?? code.toUpperCase()}
            <span className="sr-only">{done ? ", filled in" : ", not filled in yet"}</span>
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
