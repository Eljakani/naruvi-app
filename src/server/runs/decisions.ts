import "server-only"
import type { Decide } from "@/server/decisions/jev"
import type { startRun } from "./tracer"

/** Each decision request becomes its own traced step (questions, tokens, model). */
export function tracedDecide(run: Awaited<ReturnType<typeof startRun>>, decide: Decide, model: string): Decide {
  return (state, questions) =>
    run.step(
      `Decision request · ${Object.keys(questions).length} question${Object.keys(questions).length === 1 ? "" : "s"}`,
      () => decide(state, questions),
      (value) => `${value.model} · ${value.usage.input_tokens} input tokens · ${Object.keys(value.answers).length} answers`,
      (value) => ({ model: value.model || model, promptVersion: "jev", inputTokens: value.usage.input_tokens, outputTokens: value.usage.output_tokens }),
    )
}
