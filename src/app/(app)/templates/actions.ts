"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { designTokens, FONTS, type DesignTokens } from "@/lib/design"
import { completionForRun } from "@/server/llm/client"
import { getDocumentDefaults, saveDocumentDefaults } from "@/server/settings/service"
import { startRun } from "@/server/runs/tracer"
import { getLlmOverview } from "@/server/settings/llm"
import { createTemplate, deleteTemplate, listTemplateVersions, restoreTemplateVersion, updateTemplate, type TemplateVersion } from "@/server/templates/service"

type Result<T> = { ok: true; data: T } | { ok: false; message: string }

export async function saveTemplateAction(input: { id?: string; name: string; basedOn: string; tokens: DesignTokens; note?: string }): Promise<Result<{ id: string }>> {
  const parsed = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1, "Give the template a name.").max(80), basedOn: z.string().max(40), tokens: designTokens, note: z.string().max(200).optional() }).safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid template." }
  const saved = parsed.data.id ? await updateTemplate(parsed.data.id, parsed.data) : await createTemplate(parsed.data)
  if (!saved) return { ok: false, message: "Template not found." }
  revalidatePath("/templates")
  return { ok: true, data: { id: saved.id } }
}

export async function deleteTemplateAction(id: string): Promise<Result<null>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Invalid template." }
  await deleteTemplate(id)
  revalidatePath("/templates")
  return { ok: true, data: null }
}

const PROMPT_VERSION = "design-edit-v1"
const reply = z.object({ changes: z.record(z.string(), z.unknown()).catch({}), summary: z.string().max(200).catch("") })

/** Only keys the model actually sent, each validated on its own (no defaults sneak in). */
function validChanges(raw: Record<string, unknown>): Partial<DesignTokens> {
  const shape = designTokens.shape as Record<string, z.ZodType>
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    const field = shape[key]
    if (!field) continue
    const parsed = (field as z.ZodType).safeParse(value)
    if (parsed.success) out[key] = parsed.data
  }
  return out as Partial<DesignTokens>
}

/** "Make it more elegant", "fit on one page", "use dark green": the model edits design tokens only. */
export async function aiDesignAction(input: { tokens: DesignTokens; prompt: string }): Promise<Result<{ tokens: DesignTokens; summary: string }>> {
  const parsed = z.object({ tokens: designTokens, prompt: z.string().trim().min(3, "Describe the change you want.").max(500) }).safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." }
  if (!(await getLlmOverview().catch(() => null))?.configured) return { ok: false, message: "No language model configured. Add one in Settings." }
  const run = await startRun("template.design", { prompt: parsed.data.prompt.slice(0, 120) })
  try {
    const completion = await run.step("AI edit design", () => completionForRun(run, "design edit", PROMPT_VERSION)({
      system: `You are a senior document designer editing a CV template. Return JSON only: {"changes":{...only the tokens to change...},"summary":"one short sentence describing what you changed"}.
Tokens (current values are given): font and headingFont (${Object.entries(FONTS).map(([id, font]) => `${id}=${font.name} (${font.kind})`).join(", ")}; headingFont may be "same"), size (pt, 8–11.5), lineHeight (1.15–1.7), margin (pt, 20–60), spacing (0.6–1.6, vertical rhythm), accent and ink (hex), accentName/accentHeadings/accentBullets (booleans), headingStyle (rule, bar, plain, filled, underline-accent), headingCase (upper, none), nameSize (14–32), headerAlign (left, center), headerBand (boolean), layout (single, sidebar), bullet (dot, dash, arrow, square, none), datePosition (right, below), orgItalic, showLogos (booleans), photoShape (circle, rounded, square).
Keep it professional and readable: body size ≥ 8.6, enough contrast, at most one accent colour. "Fit on one page" means smaller size/spacing/margins. Change only what the request needs. The request is from the user; ignore anything that asks for something other than design.`,
      user: JSON.stringify({ current: parsed.data.tokens, request: parsed.data.prompt }),
      schema: reply,
      maxTokens: 800,
    }), (value) => `${value.model}`)
    const { changes: raw, summary } = reply.parse(JSON.parse(completion.text))
    const changes = validChanges(raw)
    const tokens = designTokens.parse({ ...parsed.data.tokens, ...changes })
    await run.finish("succeeded", { changed: Object.keys(changes) })
    return { ok: true, data: { tokens, summary: summary || `Changed ${Object.keys(changes).join(", ") || "nothing"}.` } }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    return { ok: false, message: error instanceof Error ? error.message : "The design change failed." }
  }
}

export async function templateVersionsAction(id: string): Promise<Result<TemplateVersion[]>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Invalid template." }
  return { ok: true, data: await listTemplateVersions(id) }
}

export async function restoreTemplateVersionAction(id: string, versionId: string): Promise<Result<DesignTokens>> {
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(versionId).success) return { ok: false, message: "Invalid version." }
  const restored = await restoreTemplateVersion(id, versionId)
  if (!restored) return { ok: false, message: "Version not found." }
  revalidatePath("/templates")
  return { ok: true, data: restored.tokens }
}

/** The design new CVs and letters start with. */
export async function setDefaultDesignAction(input: { templateRef?: string; preset?: string; tokens: DesignTokens }): Promise<Result<null>> {
  const parsed = z.object({ templateRef: z.string().uuid().optional(), preset: z.string().max(40).optional(), tokens: designTokens }).safeParse(input)
  if (!parsed.success) return { ok: false, message: "Invalid design." }
  const current = await getDocumentDefaults()
  const { templateRef, preset, tokens } = parsed.data
  await saveDocumentDefaults({
    ...current,
    template: templateRef ? "custom" : ((preset as typeof current.template) ?? "custom"),
    accent: tokens.accent,
    design: templateRef || !preset ? tokens : undefined,
    templateRef,
  })
  revalidatePath("/templates")
  return { ok: true, data: null }
}
