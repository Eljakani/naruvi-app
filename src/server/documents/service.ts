import "server-only"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/server/db/client"
import { applications, documents, revisions, type QualitySummary } from "@/server/db/schema"
import { getApplication } from "@/server/applications/repository"
import { getProfile, listEntries } from "@/server/profile/repository"
import { startRun } from "@/server/runs/tracer"
import { composeCv } from "./compose"
import { cvDocument, type CvDocument } from "./model"
import { checkQuality, type QualityReport } from "./quality"
import { renderCvPdf } from "./render"

async function documentFor(applicationId: string, language: string) {
  const [existing] = await db.select().from(documents).where(and(eq(documents.applicationId, applicationId), eq(documents.kind, "cv"), eq(documents.language, language))).limit(1)
  if (existing) return existing
  const [created] = await db.insert(documents).values({ applicationId, kind: "cv", language }).returning()
  return created
}

async function addRevision(documentId: string, content: CvDocument, origin: "generate" | "manual", requirements: Parameters<typeof checkQuality>[2], runId?: string) {
  const { pages } = await renderCvPdf(content)
  const quality = checkQuality(content, pages, requirements)
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId))
  const cited = [...new Set(content.sections.flatMap((s) => s.items.flatMap((i) => i.bullets.filter((b) => b.included).flatMap((b) => b.factIds))))]
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
    const content = await run.step(
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
    const document = await documentFor(application.id, lang)
    const { revision, quality } = await run.step("render & quality gate", () => addRevision(document.id, content, "generate", application.analysis?.requirements ?? [], run.id), (value) => `${value.revision.pages} page(s) · score ${value.quality.score}${value.quality.ready ? " · ready" : ""}`)
    await db.update(applications).set({ status: quality.ready ? "ready" : "generated" }).where(eq(applications.id, application.id))
    await run.finish("succeeded", { documentId: document.id, revisionId: revision.id, score: quality.score })
    return { documentId: document.id, revisionId: revision.id }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

/** Save an edited CV (include/exclude, order) as a new revision. */
export async function saveCvEdit(documentId: string, input: unknown) {
  const content = cvDocument.parse(input)
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId))
  if (!doc) throw new Error("Document not found.")
  const application = await getApplication(doc.applicationId)
  const result = await addRevision(documentId, content, "manual", application?.analysis?.requirements ?? [])
  await db.update(applications).set({ status: result.quality.ready ? "ready" : "generated" }).where(eq(applications.id, doc.applicationId))
  return { revisionId: result.revision.id, quality: result.quality }
}

/** Undo/redo = move the pointer; revisions are never modified. */
export async function setCurrentRevision(documentId: string, revisionId: string) {
  const [revision] = await db.select().from(revisions).where(and(eq(revisions.id, revisionId), eq(revisions.documentId, documentId)))
  if (!revision) throw new Error("Revision not found for this document.")
  await db.update(documents).set({ currentRevisionId: revision.id }).where(eq(documents.id, documentId))
}

export async function getCvWorkspace(applicationId: string, language: string) {
  const [doc] = await db.select().from(documents).where(and(eq(documents.applicationId, applicationId), eq(documents.kind, "cv"), eq(documents.language, language))).limit(1)
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
  const content = cvDocument.parse(revision.content)
  const { buffer } = await renderCvPdf(content)
  return { buffer, name: `${content.header.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-CV-${content.language}.pdf` }
}
