import { z } from "zod"

/** Validated server environment. Fails fast at startup instead of at first use. */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  LLM_BASE_URL: z.string().url().default("https://api.deepseek.com/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("deepseek-chat"),
})

export const env = schema.parse(process.env)
export const llmConfigured = env.LLM_API_KEY.length > 0 || /localhost|127\.0\.0\.1|ollama/.test(env.LLM_BASE_URL)
