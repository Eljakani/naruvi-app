import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/server/db/client"
import { runSteps, runs } from "@/server/db/schema"

/**
 * Minimal workflow tracer: one `runs` row per workflow execution and one
 * `run_steps` row per step, with status, latency and a short detail. Tracing
 * failures never break the workflow itself.
 */
export async function startRun(workflow: string, input: Record<string, unknown>, applicationId?: string) {
  const [run] = await db
    .insert(runs)
    .values({ workflow, input, applicationId, status: "running", startedAt: new Date(), idempotencyKey: `${workflow}:${crypto.randomUUID()}` })
    .returning()

  async function step<T>(name: string, fn: () => Promise<T>, describe?: (value: T) => string): Promise<T> {
    const started = Date.now()
    try {
      const value = await fn()
      await db
        .insert(runSteps)
        .values({ runId: run.id, name, status: "succeeded", latencyMs: Date.now() - started, detail: describe?.(value) ?? "" })
        .catch(() => {})
      return value
    } catch (error) {
      await db
        .insert(runSteps)
        .values({ runId: run.id, name, status: "failed", latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) })
        .catch(() => {})
      throw error
    }
  }

  async function finish(status: "succeeded" | "failed", output?: Record<string, unknown>, error?: string) {
    await db.update(runs).set({ status, output, error, finishedAt: new Date() }).where(eq(runs.id, run.id)).catch(() => {})
  }

  return { id: run.id, step, finish }
}
