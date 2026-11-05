import "server-only"
import { getLlmConfiguration } from "@/server/settings/llm"
import { requestCompletion, type CompletionInput, type Completion } from "./transport"
import type { startRun } from "@/server/runs/tracer"

export type { Completion } from "./transport"
export type Complete = (input: CompletionInput) => Promise<Completion>

/** Any OpenAI-compatible endpoint, using the current saved settings. */
export const completeJson: Complete = async (input) => requestCompletion(await getLlmConfiguration(), input)

/** A request gets its own running/succeeded/failed trace, even if its caller falls back. */
export function completionForRun(run: Awaited<ReturnType<typeof startRun>>, task: string, promptVersion: string): Complete {
  return (input) => run.step(
    `AI request · ${task}`,
    () => completeJson(input),
    (value) => `${value.model} · ${value.inputTokens ?? "?"} input / ${value.outputTokens ?? "?"} output tokens · ${value.attempts ?? 1} attempt(s) · ${value.finishReason ?? "completed"}`,
    (value) => ({ model: value.model, promptVersion, inputTokens: value.inputTokens, outputTokens: value.outputTokens }),
  )
}
