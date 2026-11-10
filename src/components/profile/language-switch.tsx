"use client"

import { Segmented } from "@/components/ui/segmented"
import { cn } from "@/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { languageName } from "@/i18n/config"


/**
 * One switch for "which language am I writing in", instead of a field per
 * language. The dot shows whether that language is filled in yet.
 */
export function LanguageSwitch<L extends string>({ value, onChange, languages, filled, className, label }: { value: L; onChange: (value: L) => void; languages: readonly L[]; filled: (language: L) => boolean; className?: string; label?: string }) {
  const t = useTranslations("profile.languageSwitch")
  const locale = useLocale()
  return (
    <Segmented
      value={value}
      onChange={onChange}
      label={label ?? t("label")}
      className={className}
      options={languages.map((code) => {
        const done = filled(code)
        return {
          value: code,
          title: done ? languageName(code, locale) : t("notFilledTitle", { language: languageName(code, locale) }),
          label: (
            <>
              <span className={cn("size-1.5 rounded-full transition-colors", done ? "bg-emerald-500" : "bg-muted-foreground/30")} aria-hidden />
              {languageName(code, locale)}
              <span className="sr-only">{done ? t("filled") : t("notFilled")}</span>
            </>
          ),
        }
      })}
    />
  )
}
