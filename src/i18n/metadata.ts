import { getTranslations } from "next-intl/server"
import type { Messages } from "./messages"

/** `export const generateMetadata = titled("cv")`: a page title in the reader's language. */
export const titled = (key: keyof Messages["titles"]) => async () => ({ title: (await getTranslations("titles"))(key) })
