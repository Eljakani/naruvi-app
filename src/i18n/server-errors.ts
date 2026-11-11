import { getTranslations } from "next-intl/server"
import type en from "./messages/en/errors.json"

export type ServerErrorKey = keyof (typeof en)["serverErrors"]

/** A server action's error message in the reader's language. */
export async function serverError(key: ServerErrorKey, values?: Record<string, string>) {
  const t = (await getTranslations("serverErrors")) as unknown as (key: string, values?: Record<string, string>) => string
  return t(key, values)
}
