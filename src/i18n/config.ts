/** Locales the UI ships in. English is the default and the source catalog. */
export const locales = ["en", "fr", "ar"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "en"
export const LOCALE_COOKIE = "NEXT_LOCALE"

export const localeNames: Record<Locale, string> = { en: "English", fr: "Français", ar: "العربية" }

export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale)
export const direction = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr")

/** The saved choice wins; otherwise the browser's first supported language. */
export function pickLocale(saved: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(saved)) return saved
  for (const part of (acceptLanguage ?? "").split(",")) {
    const base = part.split(";")[0].trim().slice(0, 2).toLowerCase()
    if (isLocale(base)) return base
  }
  return defaultLocale
}

/** A language code ("fr") as a name in the reader's language ("French", "français", "الفرنسية"). */
export function languageName(code: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}
