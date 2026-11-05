"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { generateCv, generateLetter, saveCvEdit, setCurrentRevision } from "@/server/documents/service"
import { getApplication } from "@/server/applications/repository"
import { REVISE_PROMPT_VERSION, reviseCv } from "@/server/documents/ai-compose"
import { cvDocument } from "@/server/documents/model"
import { verifyCvRewrites } from "@/server/documents/verify-docs"
import { completionForRun } from "@/server/llm/client"
import { listEntries } from "@/server/profile/repository"
import { tracedDecide } from "@/server/runs/decisions"
import { startRun } from "@/server/runs/tracer"
import { decisionClient } from "@/server/settings/decisions"
import { getLlmOverview } from "@/server/settings/llm"

const uuid = z.string().uuid()
const lang = z.string().regex(/^[a-z]{2}$/)

export async function generateCvAction(formData: FormData) {
  const applicationId = uuid.parse(formData.get("applicationId"))
  const language = lang.parse(formData.get("language"))
  await generateCv(applicationId, language)
  revalidatePath(`/applications/${applicationId}`, "layout")
  redirect(`/applications/${applicationId}/cv?lang=${language}`)
}

export async function saveCvEditAction(applicationId: string, documentId: string, content: unknown) {
  try {
    const result = await saveCvEdit(uuid.parse(documentId), content)
    revalidatePath(`/applications/${uuid.parse(applicationId)}`, "layout")
    return { ok: true as const, data: { revisionId: result.revisionId, score: result.quality.score, pages: result.quality.pages, ready: result.quality.ready } }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function setCurrentRevisionAction(applicationId: string, documentId: string, revisionId: string) {
  try {
    await setCurrentRevision(uuid.parse(documentId), uuid.parse(revisionId))
    revalidatePath(`/applications/${uuid.parse(applicationId)}`, "layout")
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function generateLetterAction(formData: FormData) {
  const applicationId = uuid.parse(formData.get("applicationId"))
  const language = lang.parse(formData.get("language"))
  await generateLetter(applicationId, language)
  revalidatePath(`/applications/${applicationId}`, "layout")
  redirect(`/applications/${applicationId}/letter?lang=${language}`)
}

/** Applies a free-form request to the CV draft. Returns the revised draft; nothing is saved until the user saves. */
export async function reviseCvAction(applicationId: string, draft: unknown, request: string, bulletId?: string) {
  const parsed = z.object({ applicationId: uuid, draft: cvDocument, request: z.string().trim().min(2, "Say what you want changed.").max(600), bulletId: z.string().max(80).optional() }).safeParse({ applicationId, draft, request, bulletId })
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid request." }
  if (!(await getLlmOverview().catch(() => null))?.configured) return { ok: false as const, error: "No language model configured. Add one in Settings." }
  const [application, entries] = await Promise.all([getApplication(parsed.data.applicationId), listEntries()])
  const facts = new Map(entries.filter((entry) => entry.status === "verified").flatMap((entry) => entry.facts.map((fact) => [fact.id, fact.statement] as const)))
  const run = await startRun("cv.revise", { request: parsed.data.request.slice(0, 120), scope: parsed.data.bulletId ? "line" : "cv" }, parsed.data.applicationId)
  try {
    const job = application ? { title: application.job.title, company: application.job.company?.name ?? "", description: application.job.rawText } : null
    let result = await run.step("AI revise", () => reviseCv(parsed.data.draft, parsed.data.request, facts, job, completionForRun(run, "CV revision", REVISE_PROMPT_VERSION), parsed.data.bulletId), (value) => `${value.changed} change(s) · ${value.rejected} rejected by the fact check`)
    const decisions = await decisionClient().catch(() => null)
    if (decisions && result.changed) {
      const checked = await run.step("verify rewrites (decision model)", () => verifyCvRewrites(result.doc, entries, tracedDecide(run, decisions.decide, decisions.model)), (value) => `${value.reverted} reverted`).catch(() => null)
      if (checked) result = { ...result, doc: checked.doc, rejected: result.rejected + checked.reverted }
    }
    await run.finish("succeeded", { changed: result.changed, rejected: result.rejected })
    return { ok: true as const, data: result }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    return { ok: false as const, error: error instanceof Error ? error.message : "The revision failed." }
  }
}
