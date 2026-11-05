import "server-only"
import { advanceAutomatically } from "@/server/tracking/service"
import { decisionClient } from "@/server/settings/decisions"
import { tracedDecide } from "@/server/runs/decisions"
import { verifyCvRewrites, verifyLetterRewrites } from "./verify-docs"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/server/db/client"
import { documents, revisions, type QualitySummary } from "@/server/db/schema"
import { getApplication } from "@/server/applications/repository"
import { getProfile, listEntries } from "@/server/profile/repository"
import { getDocumentDefaults } from "@/server/settings/service"
import { startRun } from "@/server/runs/tracer"
import { getLlmOverview } from "@/server/settings/llm"
import { completionForRun } from "@/server/llm/client"
import { DOCUMENT_PROMPT_VERSION, enrichCv, enrichLetter, POLISH_PROMPT_VERSION, polishCv, researchSources } from "./ai-compose"
import { composeCv } from "./compose"
import { cvDocument, type CvDocument } from "./model"
import { checkQuality, type QualityReport } from "./quality"
import { checkLetter, composeLetter, isPlaceholder, letterDocument, type LetterDocument } from "./letter"
import { renderCvPdf, renderLetterPdf } from "./render"

type Kind = "cv" | "cover_letter"

/** Keep the document's current design on regenerate; use the user's defaults the first time. */
async function designFor(documentId: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId))
  if (doc?.currentRevisionId) {
    const [current] = await db.select({ content: revisions.content }).from(revisions).where(eq(revisions.id, doc.currentRevisionId))
    const content = current?.content as { template?: string; accent?: string; header?: { showPhoto?: boolean } } | undefined
    if (content?.template) return { template: content.template as "classic" | "modern" | "serif", accent: content.accent ?? "#2563eb", showPhoto: Boolean(content.header?.showPhoto) }
  }
  return getDocumentDefaults()
}

async function documentFor(applicationId: string, language: string, kind: Kind = "cv") {
  const [existing] = await db.select().from(documents).where(and(eq(documents.applicationId, applicationId), eq(documents.kind, kind), eq(documents.language, language))).limit(1)
  if (existing) return existing
  const [created] = await db.insert(documents).values({ applicationId, kind, language }).returning()
  return created
}

/** Render + check a document of either kind. */
async function evaluate(content: CvDocument | LetterDocument, requirements: Parameters<typeof checkQuality>[2]) {
  const isLetter = "kind" in content && content.kind === "cover_letter"
  const rendered = isLetter ? await renderLetterPdf(content as LetterDocument) : await renderCvPdf(content as CvDocument)
  const quality = isLetter ? checkLetter(content as LetterDocument, rendered.pages) : checkQuality(content as CvDocument, rendered.pages, requirements)
  if (rendered.missingScripts.length) {
    // Text in a script whose font could not be loaded would print as empty boxes.
    quality.checks.push({ id: "fonts", status: "fail", label: "Fonts for every script", detail: `No font available for ${rendered.missingScripts.join(", ")} text. Connect to the internet once so Naruvi can download it.` })
    quality.errors += 1
    quality.score = Math.max(0, quality.score - 20)
    quality.ready = false
  }
  const cited = isLetter
    ? [...new Set([...(content as LetterDocument).highlights.filter((h) => h.included).flatMap((h) => h.factIds), ...(content as LetterDocument).paragraphs.filter((p) => p.included).flatMap((p) => p.factIds ?? [])])]
    : [...new Set((content as CvDocument).sections.flatMap((s) => s.items.flatMap((i) => i.bullets.filter((b) => b.included).flatMap((b) => b.factIds))))]
  return { pages: rendered.pages, quality, cited }
}

async function addRevision(documentId: string, content: CvDocument | LetterDocument, origin: "generate" | "manual", requirements: Parameters<typeof checkQuality>[2], runId?: string) {
  const { pages, quality, cited } = await evaluate(content, requirements)
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId))
  return db.transaction(async (tx) => {
    const [revision] = await tx
      .insert(revisions)
      .values({
        documentId,
        parentId: doc.currentRevisionId,
        origin,
        verdict: "kept",
        content: content as unknown as Record<string, unknown>,
        pages,
        quality: quality as unknown as QualitySummary,
        citedFactIds: cited,
        runId,
      })
      .returning()
    await tx.update(documents).set({ currentRevisionId: revision.id }).where(eq(documents.id, documentId))
    return { revision, quality }
  })
}

/** Compose a grounded CV for an application and store it as a new revision. */
export async function generateCv(applicationId: string, language?: string) {
  const application = await getApplication(applicationId)
  if (!application) throw new Error("Application not found.")
  const profile = await getProfile()
  if (!profile) throw new Error("Create your profile first.")
  const lang = language ?? application.language
  const run = await startRun("cv.generate", { applicationId, language: lang }, applicationId)
  try {
    const entries = await run.step("load profile", () => listEntries(), (value) => `${value.length} entries`)
    let content = await run.step(
      "compose (grounded)",
      async () =>
        composeCv(
          { fullName: profile.fullName, headlines: profile.headlines, email: profile.email, phone: profile.phone, location: profile.location, links: profile.links, photoPath: profile.photoPath, defaultLanguage: profile.defaultLanguage },
          entries,
          application.analysis,
          { language: lang },
        ),
      (value) => `${value.sections.length} sections · ${value.sections.flatMap((s) => s.items.flatMap((i) => i.bullets.filter((b) => b.included))).length} bullets`,
    )
    const model = await run.step("Check AI configuration", () => getLlmOverview(), (value) => value.configured ? `${value.model} configured` : "AI skipped: no usable model key or local model is configured.").catch(() => null)
    if (model?.configured) {
      content = await run.step("AI tailor CV", () => enrichCv(content, entries, application.analysis, {
        title: application.job.title, company: application.job.company?.name ?? "", description: application.job.rawText,
      }, completionForRun(run, "CV tailoring", DOCUMENT_PROMPT_VERSION)), (value) => `${value.aiAssistance?.status ?? "unchanged"} · ${value.aiAssistance?.changes ?? 0} entries tailored${value.aiAssistance?.reason ? ` · ${value.aiAssistance.reason}` : ""}`)
      const polished = await run
        .step("AI order sections & headline", () => polishCv(content, { title: application.job.title, company: application.job.company?.name ?? "", description: application.job.rawText }, completionForRun(run, "CV ordering", POLISH_PROMPT_VERSION)), (value) => `headline ${value.headline ? `→ “${value.doc.header.headline}”` : "kept"} · ${value.sectionsMoved ? "sections reordered · " : ""}${value.reordered} list(s) reordered · ${value.hidden} off-topic item(s) hidden`)
        .catch(() => null) // ordering is polish, never a blocker
      if (polished) content = polished.doc
      const decisions = await decisionClient().catch(() => null)
      if (decisions) {
        const checked = await run
          .step("verify rewrites (decision model)", () => verifyCvRewrites(content, entries, tracedDecide(run, decisions.decide, decisions.model)), (value) => `${value.checked} rewritten bullet(s) checked · ${value.reverted} reverted to approved wording`)
          .catch(() => null)
        if (checked) content = checked.doc
      }
    }
    const document = await documentFor(application.id, lang)
    const design = await designFor(document.id)
    content.template = design.template
    content.accent = design.accent
    content.header.showPhoto = design.showPhoto && Boolean(content.header.photoPath)
    const { revision, quality } = await run.step("render & quality gate", () => addRevision(document.id, content, "generate", application.analysis?.requirements ?? [], run.id), (value) => `${value.revision.pages} page(s) · score ${value.quality.score}${value.quality.ready ? " · ready" : ""}`)
    await advanceAutomatically(application.id, quality.ready ? "ready" : "generated")
    await run.finish("succeeded", { documentId: document.id, revisionId: revision.id, score: quality.score })
    return { documentId: document.id, revisionId: revision.id }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

/** Save an edited CV or letter as a new revision. */
export async function saveCvEdit(documentId: string, input: unknown) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId))
  if (!doc) throw new Error("Document not found.")
  const content = doc.kind === "cover_letter" ? letterDocument.parse(input) : cvDocument.parse(input)
  if ("kind" in content) {
    // A paragraph the user rewrote is no longer a placeholder.
    content.paragraphs = content.paragraphs.map((p) => ({ ...p, placeholder: p.kind === "motivation" ? /^\s*\[/.test(p.text) : false }))
  }
  const application = await getApplication(doc.applicationId)
  const result = await addRevision(documentId, content, "manual", application?.analysis?.requirements ?? [])
  if (doc.kind === "cv") await advanceAutomatically(doc.applicationId, result.quality.ready ? "ready" : "generated")
  return { revisionId: result.revision.id, quality: result.quality }
}

/** Compose a cover letter (grounded highlights + localized wording + placeholder). */
export async function generateLetter(applicationId: string, language?: string) {
  const application = await getApplication(applicationId)
  if (!application) throw new Error("Application not found.")
  const profile = await getProfile()
  if (!profile) throw new Error("Create your profile first.")
  const lang = language ?? application.language
  const run = await startRun("letter.generate", { applicationId, language: lang }, applicationId)
  try {
    const entries = await listEntries()
    let content = await run.step(
      "compose letter (grounded)",
      async () =>
        composeLetter(
          { fullName: profile.fullName, headlines: profile.headlines, email: profile.email, phone: profile.phone, location: profile.location, links: profile.links, photoPath: profile.photoPath, defaultLanguage: profile.defaultLanguage },
          entries,
          application.analysis,
          { title: application.job.title, company: application.job.company?.name ?? "", location: application.job.location },
          { language: lang },
        ),
      (value) => `${value.highlights.filter((h) => h.included).length} highlights`,
    )
    const document = await documentFor(application.id, lang, "cover_letter")
    // Keep personal motivation that the user already wrote or reviewed.
    if (document.currentRevisionId) {
      const [previous] = await db.select({ content: revisions.content }).from(revisions).where(eq(revisions.id, document.currentRevisionId))
      const parsed = letterDocument.safeParse(previous?.content)
      const motivation = parsed.success ? parsed.data.paragraphs.find((paragraph) => paragraph.kind === "motivation") : undefined
      if (motivation?.text.trim() && !motivation.placeholder && !isPlaceholder(motivation.text) && (!motivation.originalText || (parsed.success && parsed.data.aiAssistance?.reviewed))) {
        content.paragraphs = content.paragraphs.map((paragraph) => paragraph.kind === "motivation" ? { ...motivation, originalText: undefined } : paragraph)
      }
    }
    const model = await run.step("Check AI configuration", () => getLlmOverview(), (value) => value.configured ? `${value.model} configured` : "AI skipped: no usable model key or local model is configured.").catch(() => null)
    if (model?.configured) {
      content = await run.step("AI draft letter", () => enrichLetter(content, entries, {
        title: application.job.title, company: application.job.company?.name ?? "", description: application.job.rawText,
        url: application.job.sourceUrl ?? "",
      }, researchSources(application.job.company?.research), completionForRun(run, "cover-letter drafting", DOCUMENT_PROMPT_VERSION)), (value) => `${value.aiAssistance?.status ?? "unchanged"} · ${value.aiAssistance?.changes ?? 0} passages tailored${value.aiAssistance?.reason ? ` · ${value.aiAssistance.reason}` : ""}`)
      const decisions = await decisionClient().catch(() => null)
      if (decisions) {
        const checked = await run
          .step("verify rewrites (decision model)", () => verifyLetterRewrites(content, entries, researchSources(application.job.company?.research), tracedDecide(run, decisions.decide, decisions.model)), (value) => `${value.checked} passage(s) checked · ${value.reverted} reverted`)
          .catch(() => null)
        if (checked) content = checked.doc
      }
    }
    const design = await designFor(document.id)
    content.template = design.template
    content.accent = design.accent
    const { revision } = await run.step("render & quality gate", () => addRevision(document.id, content, "generate", [], run.id), (value) => `${value.revision.pages} page(s) · score ${value.quality.score}`)
    await run.finish("succeeded", { documentId: document.id, revisionId: revision.id })
    return { documentId: document.id, revisionId: revision.id }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

/** Undo/redo = move the pointer; revisions are never modified. */
export async function setCurrentRevision(documentId: string, revisionId: string) {
  const [revision] = await db.select().from(revisions).where(and(eq(revisions.id, revisionId), eq(revisions.documentId, documentId)))
  if (!revision) throw new Error("Revision not found for this document.")
  await db.update(documents).set({ currentRevisionId: revision.id }).where(eq(documents.id, documentId))
}

export async function getCvWorkspace(applicationId: string, language: string) {
  return getWorkspace(applicationId, language, "cv") as Promise<Awaited<ReturnType<typeof getWorkspace>> & { current: { content: CvDocument } | null }>
}

export async function getLetterWorkspace(applicationId: string, language: string) {
  const workspace = await getWorkspace(applicationId, language, "cover_letter")
  if (!workspace) return null
  return { ...workspace, current: workspace.current ? { ...workspace.current, content: workspace.current.content as unknown as LetterDocument } : null }
}

async function getWorkspace(applicationId: string, language: string, kind: Kind) {
  const [doc] = await db.select().from(documents).where(and(eq(documents.applicationId, applicationId), eq(documents.kind, kind), eq(documents.language, language))).limit(1)
  if (!doc) return null
  const history = await db
    .select({ id: revisions.id, origin: revisions.origin, pages: revisions.pages, quality: revisions.quality, createdAt: revisions.createdAt })
    .from(revisions)
    .where(eq(revisions.documentId, doc.id))
    .orderBy(desc(revisions.createdAt))
    .limit(30)
  const [current] = doc.currentRevisionId ? await db.select().from(revisions).where(eq(revisions.id, doc.currentRevisionId)) : []
  return {
    document: doc,
    current: current ? { ...current, content: current.content as unknown as CvDocument, quality: current.quality as unknown as QualityReport } : null,
    history: history.map((item) => ({ ...item, quality: item.quality as unknown as QualityReport | null })),
  }
}

export async function revisionPdf(revisionId: string) {
  const [revision] = await db.select().from(revisions).where(eq(revisions.id, revisionId))
  if (!revision?.content) return null
  const raw = revision.content as { kind?: string }
  if (raw.kind === "cover_letter") {
    const letter = letterDocument.parse(raw)
    const { buffer } = await renderLetterPdf(letter)
    return { buffer, name: `${letter.header.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-Cover-letter-${letter.language}.pdf` }
  }
  const content = cvDocument.parse(raw)
  const { buffer } = await renderCvPdf(content)
  return { buffer, name: `${content.header.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-CV-${content.language}.pdf` }
}
