import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"
import { locale as rootLocale } from "next/root-params"
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config"
import { catalogs } from "./messages"

export default getRequestConfig(async () => {
  let locale: string | undefined
  // Pages get the locale from the [locale] segment (the proxy rewrites to it);
  // Server Actions and Route Handlers have no root params, so read the cookie.
  try {
    locale = await rootLocale()
  } catch {
    locale = (await cookies()).get(LOCALE_COOKIE)?.value
  }
  const resolved = isLocale(locale) ? locale : defaultLocale
  return { locale: resolved, messages: catalogs[resolved] }
})
