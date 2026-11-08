import "server-only"
import { z } from "zod"

/** Validated server environment. Fails fast at startup instead of at first use. */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  LLM_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("deepseek-chat"),
  SETTINGS_ENCRYPTION_KEY: z.string().default(""),
  TYPESAFE_API_KEY: z.string().default(""),
  TYPESAFE_MODEL: z.string().default("jev-latest"),
}).refine(
  (data) => process.env.NODE_ENV !== "production" || /^[a-f0-9]{64}$/i.test(data.SETTINGS_ENCRYPTION_KEY),
  { message: "SETTINGS_ENCRYPTION_KEY must be a 64-char hex key in production. Generate one with: npm run settings:key", path: ["SETTINGS_ENCRYPTION_KEY"] },
)

export const env = schema.parse(process.env)
