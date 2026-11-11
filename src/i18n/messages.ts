import en from "./messages/en"
import fr from "./messages/fr"
import ar from "./messages/ar"
import type { Locale } from "./config"

export type Messages = typeof en

/** Typed against English, so a key missing from French or Arabic fails typecheck. */
export const catalogs: Record<Locale, Messages> = { en, fr, ar }

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
