import { SettingsError } from "@/server/settings/errors"

export type AiRequestMetrics = { model: string; inputTokens: number | null; outputTokens: number | null; attempts: number; finishReason?: string }

/** Safe operational metadata only; never attach the SDK error, prompt, key or response text. */
export class AiRequestError extends SettingsError {
  constructor(message: string, public readonly metrics: AiRequestMetrics) { super(message) }
}
