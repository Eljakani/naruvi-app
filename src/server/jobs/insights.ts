import "server-only"
import { eq } from "drizzle-orm"
import { db } from "@/server/db/client"
import { jobs } from "@/server/db/schema"
import { completionForRun } from "@/server/llm/client"
import { startRun } from "@/server/runs/tracer"
import { tracedDecide } from "@/server/runs/decisions"
import { decisionClient } from "@/server/settings/decisions"
import { getLlmOverview } from "@/server/settings/llm"
import { refreshGoalVerdicts } from "./goals"
import { ENRICH_PROMPT_VERSION, enrichJob, type JobInsights } from "./enrich"

/** Computes and stores the job's insights; never throws (enrichment is optional). */
export async function refreshJobInsights(jobId: string): Promise<JobInsights | null> {
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId), with: { company: true } })
  if (!job) return null
  const run = await startRun("job.enrich", { jobId })
  try {
    const [decisions, llm] = await Promise.all([decisionClient().catch(() => null), getLlmOverview().catch(() => null)])
    const insights = await run.step(
      decisions ? `enrich (decisions: ${decisions.model})` : llm?.configured ? "enrich (language model)" : "enrich (rules)",
      () => enrichJob({ title: job.title, company: job.company?.name ?? "", text: job.rawText, language: job.language }, {
        decide: decisions ? tracedDecide(run, decisions.decide, decisions.model) : undefined,
        complete: llm?.configured ? completionForRun(run, "job enrichment", ENRICH_PROMPT_VERSION) : undefined,
      }),
      (value) => `${value.engine} · ${value.seniority} · ${value.workMode} · ${value.skills.required.length} required / ${value.skills.nice.length} nice skills`,
    )
    await db.update(jobs).set({ insights: insights as unknown as Record<string, unknown> }).where(eq(jobs.id, jobId))
    await run.finish("succeeded", { engine: insights.engine })
    return insights
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    return null
  } finally {
    await refreshGoalVerdicts([jobId]).catch(() => undefined)
  }
}
