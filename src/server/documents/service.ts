import "server-only"
import type { DesignTokens } from "@/lib/design"
import { advanceAutomatically } from "@/server/tracking/service"
import { decisionClient } from "@/server/settings/decisions"
import { tracedDecide } from "@/server/runs/decisions"
import { verifyCvRewrites } from "./verify-docs"
import { and, desc, eq } from "drizzle-orm"
import { db } from "@/server/db/client"
import { documents, revisions, type QualitySummary } from "@/server/db/schema"
import { getApplication } from "@/server/applications/repository"
import { getProfile, listEntries } from "@/server/profile/repository"
import { availabilityFor, type GoalJob } from "@/lib/search-goals"
import { getDocumentDefaults } from "@/server/settings/service"
import { startRun } from "@/server/runs/tracer"
import { getLlmOverview } from "@/server/settings/llm"
import { completionForRun } from "@/server/llm/client"
import { CV_EDITORIAL_REVIEW_VERSION, CV_TAILOR_PROMPT_VERSION, enrichCv, enrichLetter, LETTER_PROMPT_VERSION, POLISH_PROMPT_VERSION, polishCv, researchSources, REVISE_PROMPT_VERSION, reviewCvTailoring, reviseCv } from "./ai-compose"
import { runCvAgent } from "./cv-agent"
import { composeCv } from "./compose"
import { cvDocument, type CvDocument } from "./model"
import { checkQuality, type QualityReport } from "./quality"
import { checkLetter, composeLetter, isPlaceholder, letterDocument, type LetterDocument } from "./letter"
import { contactVersion, getLiveContact } from "./live-contact"
import { renderCvPdf, renderLetterPdf } from "./render"

type Kind = "cv" | "cover_letter"

/** Keep the document's current design on regenerate; use the user's defaults the first time. */
async function designFor(documentId: string) {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId))
  if (doc?.currentRevisionId) {
    const [current] = await db.select({ content: revisions.content }).from(revisions).where(eq(revisions.id, doc.currentRevisionId))
    const content = current?.content as { template?: string; accent?: string; design?: DesignTokens; templateRef?: string; header?: { showPhoto?: boolean } } | undefined
    if (content?.template) return { template: content.template as CvDocument["template"], accent: content.accent ?? "#2563eb", design: content.design, templateRef: content.templateRef, showPhoto: Boolean(content.header?.showPhoto) }
  }
  // A new cover letter matches the application's CV (the pair is one template).
  if (doc?.kind === "cover_letter") {
    const [cv] = await db.select().from(documents).where(and(eq(documents.applicationId, doc.applicationId), eq(documents.kind, "cv"))).orderBy(desc(documents.createdAt)).limit(1)
    if (cv?.currentRevisionId && cv.id !== documentId) return designFor(cv.id)
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
          { fullName: profile.fullName, headlines: profile.headlines, summaries: profile.summaries, email: profile.email, phone: profile.phone, location: profile.location, links: profile.links, photoPath: profile.photoPath, defaultLanguage: profile.defaultLanguage },
          entries,
          application.analysis,
          { language: lang },
        ),
      (value) => `${value.sections.length} sections · ${value.sections.flatMap((s) => s.items.flatMap((i) => i.bullets.filter((b) => b.included))).length} bullets`,
    )
    const baseline = content
    const model = await run.step("Check AI configuration", () => getLlmOverview(), (value) => value.configured ? `${value.model} configured` : "AI skipped: no usable model key or local model is configured.").catch(() => null)
    if (model?.configured) {
      content = await run.step("AI tailor CV", () => enrichCv(content, entries, application.analysis, {
        title: application.job.title, company: application.job.company?.name ?? "", description: application.job.rawText,
      }, completionForRun(run, "CV tailoring", CV_TAILOR_PROMPT_VERSION)), (value) => `${value.aiAssistance?.status ?? "unchanged"} · ${value.aiAssistance?.changes ?? 0} entries tailored${value.aiAssistance?.reason ? ` · ${value.aiAssistance.reason}` : ""}`)
      const polished = await run
        .step("AI order sections & headline", () => polishCv(content, { title: application.job.title, company: application.job.company?.name ?? "", description: application.job.rawText }, completionForRun(run, "CV ordering", POLISH_PROMPT_VERSION)), (value) => `headline ${value.headline ? `→ “${value.doc.header.headline}”` : "kept"} · summary ${value.summary ? "tailored" : "kept"} · ${value.sectionsMoved ? "sections reordered · " : ""}${value.reordered} list(s) reordered · ${value.hidden} off-topic item(s) hidden`)
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
    if (design.design) content.design = design.design
    if (design.templateRef) content.templateRef = design.templateRef
    content.accent = design.accent
    content.header.showPhoto = design.showPhoto && Boolean(content.header.photoPath)
    // Content agent: render with the real design, score, and fix what the checks flag.
    if (model?.configured) {
      const facts = new Map(entries.filter((entry) => entry.status === "verified").flatMap((entry) => entry.facts.map((fact) => [fact.id, fact.statement] as const)))
      const job = { title: application.job.title, company: application.job.company?.name ?? "", description: application.job.rawText }
      const requirements = application.analysis?.requirements ?? []
      const agent = await run
        .step("CV agent (render, score, fix)", () => runCvAgent(content, {}, {
          evaluate: (doc) => evaluate(doc, requirements).then(({ pages, quality }) => ({ pages, quality })),
          revise: (doc, instruction) => reviseWithChecks(run, doc, instruction, facts, job, entries),
        }), (value) => `${value.rounds.length} round(s) · score ${value.scoreBefore} → ${value.scoreAfter} · ${value.pages} page(s)`)
        .catch(() => null)
      if (agent?.improved) content = agent.doc
      const edited = await run.step(
        "Editorial review of CV rewrites",
        () => reviewCvTailoring(baseline, content, entries, job, completionForRun(run, "CV editorial review", CV_EDITORIAL_REVIEW_VERSION)),
        (value) => `${value.accepted} worthwhile rewrite(s) kept · ${value.rejected} reverted`,
      )
      content = edited.doc
    }
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

/** Create an editable prose draft using the candidate's own reasons. */
export async function generateLetter(applicationId: string, language?: string, authorNotes = "") {
  const application = await getApplication(applicationId)
  if (!application) throw new Error("Application not found.")
  const profile = await getProfile()
  if (!profile) throw new Error("Create your profile first.")
  const lang = language ?? application.language
  const run = await startRun("letter.generate", { applicationId, language: lang }, applicationId)
  try {
    const insights = application.job.insights as { contract?: string; programme?: { duration: string; start: string; rhythm: string } } | null
    let content = composeLetter(profile, [], null,
      { title: application.job.title, company: application.job.company?.name ?? "", location: application.job.location, contract: insights?.contract, programme: insights?.programme },
      { language: lang, maxHighlights: 0 },
    )
    content.authorNotes = authorNotes
    const document = await documentFor(application.id, lang, "cover_letter")
    // Keep personal motivation that the user already wrote or reviewed.
    if (document.currentRevisionId) {
      const [previous] = await db.select({ content: revisions.content }).from(revisions).where(eq(revisions.id, document.currentRevisionId))
      const parsed = letterDocument.safeParse(previous?.content)
      if (parsed.success && !authorNotes) content.authorNotes = parsed.data.authorNotes
      const motivation = parsed.success ? parsed.data.paragraphs.find((paragraph) => paragraph.kind === "motivation") : undefined
      if (motivation?.text.trim() && !motivation.placeholder && !isPlaceholder(motivation.text) && (!motivation.originalText || (parsed.success && parsed.data.aiAssistance?.reviewed))) {
        content.paragraphs = content.paragraphs.map((paragraph) => paragraph.kind === "motivation" ? { ...motivation, originalText: undefined } : paragraph)
      }
    }
    if (!(await getLlmOverview().catch(() => null))?.configured) throw new Error("Connect a language model in Integrations, then try again.")
    content = await draftLetter(run, application, content)
    if (content.aiAssistance?.status === "fallback") throw new Error(content.aiAssistance.reason ?? "Couldn’t draft the letter. Try again.")
    if (content.paragraphs.some((paragraph) => paragraph.included && (paragraph.placeholder || isPlaceholder(paragraph.text)))) {
      throw new Error("The AI returned an incomplete letter. Try again.")
    }
    const design = await designFor(document.id)
    content.template = design.template
    if (design.design) content.design = design.design
    if (design.templateRef) content.templateRef = design.templateRef
    content.accent = design.accent
    const { revision } = await run.step("render & quality gate", () => addRevision(document.id, content, "generate", [], run.id), (value) => `${value.revision.pages} page(s) · score ${value.quality.score}`)
    await run.finish("succeeded", { documentId: document.id, revisionId: revision.id })
    return { documentId: document.id, revisionId: revision.id }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

async function draftLetter(run: Awaited<ReturnType<typeof startRun>>, application: NonNullable<Awaited<ReturnType<typeof getApplication>>>, content: LetterDocument, instruction = "") {
  const profile = await getProfile()
  const availability = profile ? availabilityFor(profile.goals, { ...application.job, insights: application.job.insights as GoalJob["insights"] }) : null
  return run.step("AI draft personal letter", () => enrichLetter(content, {
    availability: availability ?? undefined,
    title: application.job.title,
    company: application.job.company?.name ?? "",
    description: application.job.rawText,
    contract: (application.job.insights as { contract?: string } | null)?.contract,
    programme: (application.job.insights as { programme?: { duration: string; start: string; rhythm: string } } | null)?.programme,
  }, researchSources(application.job.company?.research), completionForRun(run, "cover-letter drafting", LETTER_PROMPT_VERSION), instruction),
  (value) => `${value.aiAssistance?.status ?? "unchanged"} · ${value.aiAssistance?.changes ?? 0} changes`)
}

export async function suggestLetter(applicationId: string, draft: LetterDocument, instruction: string) {
  const application = await getApplication(applicationId)
  if (!application) throw new Error("Application not found.")
  if (!(await getLlmOverview().catch(() => null))?.configured) throw new Error("Connect a language model in Integrations first.")
  const run = await startRun("letter.revise", { applicationId, language: draft.language }, applicationId)
  try {
    const proposal = await draftLetter(run, application, draft, instruction)
    if (proposal.aiAssistance?.status === "fallback") throw new Error(proposal.aiAssistance.reason ?? "Couldn’t draft a suggestion.")
    await run.finish("succeeded", { changes: proposal.aiAssistance?.changes ?? 0 })
    return proposal
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
    contactVersion: contactVersion(await getLiveContact()),
    current: current ? { ...current, content: current.content as unknown as CvDocument, quality: current.quality as unknown as QualityReport } : null,
    history: history.map((item) => ({ ...item, quality: item.quality as unknown as QualityReport | null })),
  }
}

export async function revisionPdf(revisionId: string, live = false) {
  const [revision] = await db.select().from(revisions).where(eq(revisions.id, revisionId))
  if (!revision?.content) return null
  const raw = revision.content as { kind?: string }
  const contact = live ? await getLiveContact() : null
  if (raw.kind === "cover_letter") {
    const letter = letterDocument.parse(raw)
    const { buffer } = await renderLetterPdf({ ...letter, header: { ...letter.header, ...contact } })
    return { buffer, name: `${letter.header.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-Cover-letter-${letter.language}.pdf` }
  }
  const content = cvDocument.parse(raw)
  const { buffer } = await renderCvPdf({ ...content, header: { ...content.header, ...contact } })
  return { buffer, name: `${content.header.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-CV-${content.language}.pdf` }
}

/** One revision step: AI edit with the fact check, then the decision model's claim check. */
export async function reviseWithChecks(run: Awaited<ReturnType<typeof startRun>>, doc: CvDocument, instruction: string, facts: Map<string, string>, job: { title: string; company: string; description: string } | null, entries: Awaited<ReturnType<typeof listEntries>>, bulletId?: string) {
  const result = await reviseCv(doc, instruction, facts, job, completionForRun(run, "CV revision", REVISE_PROMPT_VERSION), bulletId)
  const decisions = await decisionClient().catch(() => null)
  if (!decisions || !result.changed) return result
  const checked = await verifyCvRewrites(result.doc, entries, tracedDecide(run, decisions.decide, decisions.model)).catch(() => null)
  return checked ? { ...result, doc: checked.doc, rejected: result.rejected + checked.reverted } : result
}

/** Apply a free-form request to the current CV of an application (assistant) and save it as a new revision. */
export async function reviseSavedCv(applicationId: string, language: string, request: string) {
  if (!(await getLlmOverview().catch(() => null))?.configured) throw new Error("No language model is configured.")
  const [application, entries, workspace] = await Promise.all([getApplication(applicationId), listEntries(), getCvWorkspace(applicationId, language)])
  if (!application) throw new Error("Application not found.")
  if (!workspace?.current) throw new Error("There is no CV for this application in that language yet. Draft it first.")
  const facts = new Map(entries.filter((entry) => entry.status === "verified").flatMap((entry) => entry.facts.map((fact) => [fact.id, fact.statement] as const)))
  const job = { title: application.job.title, company: application.job.company?.name ?? "", description: application.job.rawText }
  const requirements = application.analysis?.requirements ?? []
  const run = await startRun("cv.revise", { request: request.slice(0, 120), scope: "cv", via: "assistant" }, applicationId)
  try {
    const agent = await run.step("CV agent (revise, render, score, fix)", () => runCvAgent(cvDocument.parse(workspace.current!.content), { request, protectFacts: new Set(requirements.filter((r) => r.kind === "must" && (r.status === "met" || r.status === "partial")).flatMap((r) => r.factIds)) }, {
      evaluate: (doc) => scoreCvDraft(doc, requirements),
      revise: (doc, instruction) => reviseWithChecks(run, doc, instruction, facts, job, entries),
    }), (value) => `${value.rounds.length} round(s) · score ${value.scoreBefore} → ${value.scoreAfter} · ${value.pages} page(s)`)
    const saved = agent.improved ? await saveCvEdit(workspace.document.id, agent.doc) : null
    await run.finish("succeeded", { rounds: agent.rounds.length, scoreBefore: agent.scoreBefore, scoreAfter: agent.scoreAfter, saved: Boolean(saved) })
    return { changed: Boolean(saved), note: agent.note, scoreBefore: agent.scoreBefore, scoreAfter: agent.scoreAfter, pages: agent.pages }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

/** Renders and scores a CV draft without saving it. */
export async function scoreCvDraft(doc: CvDocument, requirements: Parameters<typeof checkQuality>[2]) {
  const { pages, quality } = await evaluate(doc, requirements)
  return { pages, quality }
}
