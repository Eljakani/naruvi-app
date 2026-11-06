"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { generateCv, generateLetter, reviseWithChecks, saveCvEdit, scoreCvDraft, setCurrentRevision, suggestLetter } from "@/server/documents/service"
import { letterDocument } from "@/server/documents/letter"
import { runCvAgent } from "@/server/documents/cv-agent"
import { getApplication } from "@/server/applications/repository"
import { cvDocument } from "@/server/documents/model"
import { listEntries } from "@/server/profile/repository"
import { startRun } from "@/server/runs/tracer"
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
  const authorNotes = z.string().trim().max(1500).parse(formData.get("authorNotes") ?? "")
  try {
    await generateLetter(applicationId, language, authorNotes)
  } catch (error) {
    return error instanceof Error ? error.message : "Couldn’t draft the letter. Try again."
  }
  revalidatePath(`/applications/${applicationId}`, "layout")
  redirect(`/applications/${applicationId}/letter?lang=${language}`)
}

export async function suggestLetterAction(applicationId: string, draft: unknown, instruction: string) {
  try {
    const parsed = letterDocument.parse(draft)
    const direction = z.string().trim().max(600).parse(instruction)
    return { ok: true as const, data: await suggestLetter(uuid.parse(applicationId), parsed, direction) }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Couldn’t draft a suggestion." }
  }
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
    const requirements = application?.analysis?.requirements ?? []
    if (parsed.data.bulletId) {
      // One line: a single checked edit is enough.
      const result = await run.step("AI revise line", () => reviseWithChecks(run, parsed.data.draft, parsed.data.request, facts, job, entries, parsed.data.bulletId), (value) => `${value.changed} change(s) · ${value.rejected} rejected`)
      await run.finish("succeeded", { changed: result.changed })
      return { ok: true as const, data: { doc: result.doc, changed: result.changed, rejected: result.rejected, note: result.note, rounds: 1, scoreBefore: 0, scoreAfter: 0, pages: 0 } }
    }
    const agent = await run.step("CV agent (revise, render, score, fix)", () => runCvAgent(parsed.data.draft, { request: parsed.data.request, protectFacts: new Set(requirements.filter((r) => r.kind === "must" && (r.status === "met" || r.status === "partial")).flatMap((r) => r.factIds)) }, {
      evaluate: (doc) => scoreCvDraft(doc, requirements),
      revise: (doc, instruction) => reviseWithChecks(run, doc, instruction, facts, job, entries),
    }), (value) => `${value.rounds.length} round(s) · score ${value.scoreBefore} → ${value.scoreAfter} · ${value.pages} page(s)`)
    const rejected = agent.rounds.reduce((sum, round) => sum + round.rejected, 0)
    await run.finish("succeeded", { rounds: agent.rounds.length, scoreBefore: agent.scoreBefore, scoreAfter: agent.scoreAfter })
    return { ok: true as const, data: { doc: agent.doc, changed: agent.improved ? Math.max(1, agent.changed) : 0, rejected, note: agent.note, rounds: agent.rounds.length, scoreBefore: agent.scoreBefore, scoreAfter: agent.scoreAfter, pages: agent.pages } }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    return { ok: false as const, error: error instanceof Error ? error.message : "The revision failed." }
  }
}
