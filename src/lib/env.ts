import "server-only"
import { z } from "zod"

/** Validated server environment. Fails fast at startup instead of at first use. */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  LLM_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("deepseek-chat"),
  SETTINGS_ENCRYPTION_KEY: z.string().default(""),
})

export const env = schema.parse(process.env)
