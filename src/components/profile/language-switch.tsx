"use client"

import { Segmented } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"

export const LANGUAGE_NAMES: Record<string, string> = { en: "English", fr: "Français" }

/**
 * One switch for "which language am I writing in", instead of a field per
 * language. The dot shows whether that language is filled in yet.
 */
export function LanguageSwitch<L extends string>({ value, onChange, languages, filled, className, label = "Language" }: { value: L; onChange: (value: L) => void; languages: readonly L[]; filled: (language: L) => boolean; className?: string; label?: string }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      label={label}
      className={className}
      options={languages.map((code) => {
        const done = filled(code)
        return {
          value: code,
          title: `${LANGUAGE_NAMES[code] ?? code}${done ? "" : " (not filled in yet)"}`,
          label: (
            <>
              <span className={cn("size-1.5 rounded-full transition-colors", done ? "bg-emerald-500" : "bg-muted-foreground/30")} aria-hidden />
              {LANGUAGE_NAMES[code] ?? code.toUpperCase()}
              <span className="sr-only">{done ? ", filled in" : ", not filled in yet"}</span>
            </>
          ),
        }
      })}
    />
  )
}
