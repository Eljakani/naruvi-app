"use client"

import { LanguagesIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LOCALE_COOKIE, localeNames, locales } from "@/i18n/config"
import { cn } from "@/lib/utils"

const items = locales.map((value) => ({ value, label: localeNames[value] }))

/** Interface language. Saved in a cookie; a reload re-renders every page (and its direction) in it. */
export function LanguageSwitcher({ id, compact = false, className }: { id?: string; compact?: boolean; className?: string }) {
  const locale = useLocale()
  const t = useTranslations("language")
  return (
    <Select
      items={items}
      value={locale}
      onValueChange={(value) => {
        if (!value || value === locale) return
        document.cookie = `${LOCALE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
        window.location.reload()
      }}
    >
      <SelectTrigger id={id} aria-label={t("label")} size={compact ? "sm" : "default"} className={cn(compact ? "w-auto gap-1.5 border-transparent shadow-none" : "w-full @md/field-group:w-36", className)}>
        {compact ? <LanguagesIcon aria-hidden /> : null}
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} lang={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
