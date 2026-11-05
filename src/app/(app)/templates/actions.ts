"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { designTokens, PRESETS, type DesignTokens } from "@/lib/design"
import { completionForRun } from "@/server/llm/client"
import { tracedDecide } from "@/server/runs/decisions"
import { decisionClient } from "@/server/settings/decisions"
import { DESIGN_AGENT_VERSION, runDesignAgent, type AgentResult, type DesignTurn } from "@/server/templates/design-agent"
import { layoutMetrics } from "@/server/templates/layout-metrics"
import { getDocumentDefaults, saveDocumentDefaults } from "@/server/settings/service"
import { startRun } from "@/server/runs/tracer"
import { getLlmOverview } from "@/server/settings/llm"
import { createTemplate, deleteTemplate, renderTemplatePreview, getTemplate, listTemplateVersions, restoreTemplateVersion, updateTemplate, type TemplateVersion } from "@/server/templates/service"

type Result<T> = { ok: true; data: T } | { ok: false; message: string }

function refreshDesigns() {
  revalidatePath("/templates")
  revalidatePath("/templates/[id]", "page")
  revalidatePath("/applications/[id]/cv", "page")
  revalidatePath("/applications/[id]/letter", "page")
  revalidatePath("/settings")
}

export async function saveTemplateAction(input: { id?: string; name: string; basedOn: string; tokens: DesignTokens; note?: string }): Promise<Result<{ id: string }>> {
  const parsed = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1, "Give the template a name.").max(80), basedOn: z.string().max(40), tokens: designTokens, note: z.string().max(200).optional() }).safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid template." }
  const saved = parsed.data.id ? await updateTemplate(parsed.data.id, parsed.data) : await createTemplate(parsed.data)
  if (!saved) return { ok: false, message: "Template not found." }
  refreshDesigns()
  return { ok: true, data: { id: saved.id } }
}

export async function deleteTemplateAction(id: string): Promise<Result<null>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Invalid template." }
  await deleteTemplate(id)
  refreshDesigns()
  return { ok: true, data: null }
}

/** Design requests run as an agent loop: propose, render your CV, measure, check, revise. */
export async function aiDesignAction(input: { tokens: DesignTokens; prompt: string; history?: DesignTurn[] }): Promise<Result<AgentResult>> {
  const turn = z.object({ request: z.string().max(500), outcome: z.string().max(20), summary: z.string().max(300), changes: z.record(z.string(), z.unknown()) })
  const parsed = z.object({ tokens: designTokens, prompt: z.string().trim().min(1, "Describe the change you want.").max(500), history: z.array(turn).max(10).optional() }).safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." }
  if (!(await getLlmOverview().catch(() => null))?.configured) return { ok: false, message: "No language model configured. Add one in Settings." }
  const run = await startRun("template.design", { prompt: parsed.data.prompt.slice(0, 120) })
  try {
    const complete = completionForRun(run, "design round", DESIGN_AGENT_VERSION)
    const decisions = await decisionClient().catch(() => null)
    const result = await runDesignAgent({ tokens: parsed.data.tokens, request: parsed.data.prompt, history: parsed.data.history }, {
      complete,
      measure: (tokens) => run.step("render & measure", async () => layoutMetrics((await renderTemplatePreview(tokens)).buffer), (value) => `${value.pages} page(s) · last page ${Math.round(value.lastPageFill * 100)}% full`),
      judge: async (request, before, after, measured) => {
        const changes = Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key as keyof DesignTokens])))
        if (decisions) {
          const answer = await tracedDecide(run, decisions.decide, decisions.model)({ request, designChanges: changes, rendered: measured }, { satisfied: { type: "noul", instructions: "These design changes, as rendered, do what the user asked" } })
          const value = answer.answers.satisfied
          const p = value?.type === "noul" ? value.noul : 1
          return { satisfied: p >= 0.5, reason: p >= 0.5 ? "" : "A final check suggests this doesn’t fully match your request. Try rephrasing it." }
        }
        const judged = await complete({ system: "You check whether design changes fulfil a request. Return JSON only.", schema: z.object({ satisfied: z.boolean(), reason: z.string().max(200).catch("") }), maxTokens: 200, user: JSON.stringify({ request, designChanges: changes, rendered: measured, reply: '{"satisfied":true,"reason":"what is missing if false"}' }) })
        return z.object({ satisfied: z.boolean(), reason: z.string().catch("") }).parse(JSON.parse(judged.text))
      },
    })
    await run.finish("succeeded", { rounds: result.rounds, outcome: result.outcome, reason: result.reason })
    return { ok: true, data: result }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    return { ok: false, message: error instanceof Error ? error.message : "The design change failed." }
  }
}

export async function templateVersionsAction(id: string): Promise<Result<TemplateVersion[]>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Invalid template." }
  return { ok: true, data: await listTemplateVersions(id) }
}

export async function restoreTemplateVersionAction(id: string, versionId: string): Promise<Result<{ name: string; tokens: DesignTokens }>> {
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(versionId).success) return { ok: false, message: "Invalid version." }
  const restored = await restoreTemplateVersion(id, versionId)
  if (!restored) return { ok: false, message: "Version not found." }
  refreshDesigns()
  return { ok: true, data: { name: restored.name, tokens: restored.tokens } }
}

/** The design new CVs and letters start with. */
export async function setDefaultDesignAction(input: { templateRef?: string; preset?: string; tokens: DesignTokens }): Promise<Result<null>> {
  const parsed = z.object({ templateRef: z.string().uuid().optional(), preset: z.string().max(40).optional(), tokens: designTokens }).safeParse(input)
  if (!parsed.success) return { ok: false, message: "Invalid design." }
  const current = await getDocumentDefaults()
  const { templateRef, preset, tokens } = parsed.data
  const saved = templateRef ? await getTemplate(templateRef) : null
  if (templateRef && !saved) return { ok: false, message: "Template not found. Save it again before making it your default." }
  if (preset && !Object.hasOwn(PRESETS, preset)) return { ok: false, message: "Unknown preset." }
  const design = saved?.tokens ?? tokens
  await saveDocumentDefaults({
    ...current,
    template: templateRef ? "custom" : ((preset as typeof current.template) ?? "custom"),
    accent: design.accent,
    design: templateRef || !preset ? design : undefined,
    templateRef,
  })
  refreshDesigns()
  return { ok: true, data: null }
}
