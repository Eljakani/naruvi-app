import "server-only"
import { revalidatePath } from "next/cache"
import { desc, eq, inArray, isNull } from "drizzle-orm"
import { analyzeJob, getApplication, loadProfileFacts } from "@/server/applications/repository"
import { findDuplicates } from "@/server/companies/repository"
import { listContacts } from "@/server/contacts/repository"
import { db } from "@/server/db/client"
import { applications, companies, documents, jobs, revisions } from "@/server/db/schema"
import { cvDocument } from "@/server/documents/model"
import { letterDocument } from "@/server/documents/letter"
import { generateCv, generateLetter, getCvWorkspace, getLetterWorkspace, reviseSavedCv } from "@/server/documents/service"
import { apiApplication, apiApplications, apiUpdateApplication } from "@/server/integrations/api-data"
import { saveAndTrackJob } from "@/server/integrations/extension"
import { getJob, previewJob } from "@/server/jobs/ingest"
import { saveCapture } from "@/server/jobs/leads"
import { JOB_SORTS, searchJobs } from "@/server/jobs/search"
import { canonicalJobUrl } from "@/lib/job-alerts"
import { composeContext, draftApplicationMail } from "@/server/mail/send"
import { getProfile, listEntries, getEntry } from "@/server/profile/repository"
import { getDashboard } from "@/server/queries/dashboard"
import { scheduleResearch } from "@/server/research/auto"
import { getDocumentDefaults } from "@/server/settings/service"
import { getTemplate } from "@/server/templates/service"
import { listEvents, setNotes } from "@/server/tracking/service"
import { NotFound } from "@/server/integrations/api"
import { cvText, entrySummary, fitDetail, letterText, profileSummary, styleSummary, type FitFilter } from "./shape"
import type { NaruviData } from "./server"

const refresh = () => {
  try { revalidatePath("/", "layout") } catch { /* outside a request (tests, scripts) */ }
}

async function application(id: string) {
  const found = await getApplication(id)
  if (!found) throw new NotFound("Application not found.")
  return found
}

async function profileOrThrow() {
  const profile = await getProfile()
  if (!profile) throw new Error("There is no profile yet. Create it in Naruvi first.")
  return profile
}

/** Naruvi's repositories behind the MCP server. Single-owner app: every call acts for the owner of the API key. */
export const naruviData: NaruviData = {
  async attention() {
    const data = await getDashboard()
    return {
      replies: data.replies.map((reply) => ({ applicationId: reply.applicationId, title: reply.title, company: reply.company, subject: reply.subject, from: reply.fromName || reply.fromAddress, kind: reply.kind, suggestion: reply.suggestion?.summary ?? null })),
      todo: data.attention.map((item) => ({ applicationId: item.id, title: item.title, company: item.company, reason: item.reason, message: item.message })),
      upcoming: data.upcoming.map((item) => ({ applicationId: item.id, title: item.title, company: item.company, nextStep: item.nextStep, due: item.due.toISOString() })),
    }
  },

  listApplications: (query) => apiApplications(query),

  async recentApplications(limit) {
    return db.select({ id: applications.id, title: jobs.title, company: companies.name, language: applications.language }).from(applications).innerJoin(jobs, eq(jobs.id, applications.jobId)).leftJoin(companies, eq(companies.id, jobs.companyId)).where(isNull(applications.archivedAt)).orderBy(desc(applications.updatedAt)).limit(limit)
  },

  async getApplication(id) {
    const [detail, found, events] = await Promise.all([apiApplication(id), application(id), listEvents(id)])
    return {
      ...detail,
      notes: found.notes || null,
      jobUrl: found.job.sourceUrl || null,
      history: events.slice(0, 20).map((event) => ({ from: event.fromStatus, to: event.toStatus, by: event.actor, note: event.note || null, at: event.createdAt.toISOString() })),
    }
  },

  async fitAnalysis(id, filter: FitFilter) {
    const found = await application(id)
    if (!found.analysis) return { analyzed: false, note: "No fit analysis yet. Run naruvi_run_fit_analysis to create one." }
    const facts = await loadProfileFacts(found.profileId)
    return { analyzed: true, applicationId: id, title: found.job.title, company: found.job.company?.name ?? null, ...fitDetail(found.analysis, facts, filter) }
  },

  async searchJobs({ q, sort, page }) {
    const result = await searchJobs({ q, sort: sort as keyof typeof JOB_SORTS | undefined, page })
    return { page: result.page, pages: result.pages, total: result.total, jobs: result.jobs.map((job) => ({ id: job.id, title: job.title, company: job.company, location: job.location || null, tags: job.tags, applicationId: job.applicationId, status: job.status, fit: job.fit, addedAt: job.createdAt.toISOString() })) }
  },

  async getJob(id) {
    const job = await getJob(id)
    if (!job) throw new NotFound("Job not found.")
    return { id: job.id, title: job.title, company: job.company?.name ?? null, location: job.location || null, url: job.sourceUrl || null, language: job.language, salary: job.salary ?? null, tags: job.tags, text: job.rawText.slice(0, 20_000) }
  },

  async profile() {
    const [profile, entries] = await Promise.all([profileOrThrow(), listEntries()])
    return profileSummary(profile, entries)
  },

  async entries({ kind, status, language, facts }) {
    const profile = await profileOrThrow()
    const lang = language ?? profile.defaultLanguage
    const rows = (await listEntries()).filter((entry) => (!kind || entry.kind === kind) && (status === "all" ? true : status ? entry.status === status : entry.status !== "archived"))
    return { language: lang, entries: rows.map((entry) => entrySummary(entry, lang, { facts })) }
  },

  async entry(id, language) {
    const entry = await getEntry(id)
    if (!entry) throw new NotFound("Profile entry not found.")
    const profile = await getProfile()
    return entrySummary(entry, language ?? profile?.defaultLanguage ?? "en")
  },

  async documents(applicationId) {
    const rows = await db
      .select({ applicationId: applications.id, kind: documents.kind, language: documents.language, revisionId: documents.currentRevisionId, updatedAt: documents.updatedAt, title: jobs.title, company: companies.name, pages: revisions.pages, quality: revisions.quality })
      .from(documents)
      .innerJoin(applications, eq(applications.id, documents.applicationId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .leftJoin(revisions, eq(revisions.id, documents.currentRevisionId))
      .where(applicationId ? eq(documents.applicationId, applicationId) : inArray(documents.kind, ["cv", "cover_letter"]))
      .orderBy(desc(documents.updatedAt))
      .limit(100)
    return {
      documents: rows.filter((row) => row.revisionId).map((row) => ({
        applicationId: row.applicationId,
        kind: row.kind === "cover_letter" ? "cover_letter" : "cv",
        language: row.language,
        role: row.title,
        company: row.company ?? null,
        pages: row.pages ?? null,
        qualityScore: (row.quality as { score?: number } | null)?.score ?? null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    }
  },

  async cv(applicationId, language) {
    const found = await application(applicationId)
    const lang = language ?? found.language
    const workspace = await getCvWorkspace(applicationId, lang)
    if (!workspace?.current) return { exists: false, language: lang, note: "No CV in this language yet. Use naruvi_generate_cv." }
    const doc = cvDocument.parse(workspace.current.content)
    return {
      exists: true,
      applicationId,
      language: lang,
      role: found.job.title,
      company: found.job.company?.name ?? null,
      template: doc.template,
      pages: workspace.current.pages ?? null,
      quality: workspace.current.quality ? { score: workspace.current.quality.score, ready: workspace.current.quality.ready } : null,
      strategy: doc.strategy ?? null,
      keywordCoverage: workspace.coverage ?? null,
      text: cvText(doc),
    }
  },

  async letter(applicationId, language) {
    const found = await application(applicationId)
    const lang = language ?? found.language
    const workspace = await getLetterWorkspace(applicationId, lang)
    if (!workspace?.current) return { exists: false, language: lang, note: "No cover letter in this language yet. Use naruvi_generate_cover_letter." }
    const doc = letterDocument.parse(workspace.current.content)
    return { exists: true, applicationId, language: lang, role: found.job.title, company: found.job.company?.name ?? null, placeholders: doc.paragraphs.some((paragraph) => paragraph.included && paragraph.placeholder), text: letterText(doc) }
  },

  async cvStyle() {
    const defaults = await getDocumentDefaults()
    const template = defaults.templateRef ? await getTemplate(defaults.templateRef).catch(() => null) : null
    return styleSummary(defaults, template?.name ?? null)
  },

  async contacts(q) {
    const rows = await listContacts(q)
    return { contacts: rows.slice(0, 50).map((contact) => ({ id: contact.id, name: contact.name, title: contact.title, company: contact.company, email: contact.email || null, linkedinUrl: contact.linkedinUrl || null, applications: contact.applications })) }
  },

  async updateApplication(id, change) {
    const result = await apiUpdateApplication(id, change)
    refresh()
    return result
  },

  async setNotes(id, text, mode) {
    const found = await application(id)
    const notes = mode === "append" && found.notes.trim() ? `${found.notes.trimEnd()}\n\n${text}` : text
    await setNotes(id, notes)
    refresh()
    return { applicationId: id, notes }
  },

  async runFitAnalysis({ applicationId, jobId }) {
    const target = jobId ?? (await application(applicationId!)).job.id
    if (!(await getJob(target))) throw new NotFound("Job not found.")
    const analyzed = await analyzeJob(target)
    scheduleResearch(target)
    refresh()
    const detail = await naruviData.fitAnalysis(analyzed.id, "all")
    return { applicationId: analyzed.id, ...detail }
  },

  async generateCv(applicationId, language, brief) {
    const found = await application(applicationId)
    const lang = language ?? found.language
    await generateCv(applicationId, lang, brief)
    refresh()
    return naruviData.cv(applicationId, lang)
  },

  async reviseCv(applicationId, language, request) {
    const found = await application(applicationId)
    const lang = language ?? found.language
    const result = await reviseSavedCv(applicationId, lang, request)
    refresh()
    return { ...result, cv: await naruviData.cv(applicationId, lang) }
  },

  async generateLetter(applicationId, language, notes) {
    const found = await application(applicationId)
    const lang = language ?? found.language
    await generateLetter(applicationId, lang, notes)
    refresh()
    return naruviData.letter(applicationId, lang)
  },

  async draftEmail({ applicationId, kind, replyTo, instructions, language, tone }) {
    const context = await composeContext(applicationId, kind, replyTo)
    if (!context) throw new NotFound("Application not found.")
    const draft = await draftApplicationMail({ applicationId, kind, replyTo: context.replyTo, instructions, language, tone, subject: context.subject, body: "", attachCv: false, attachLetter: false })
    return {
      sent: false,
      to: context.to || null,
      replyTo: context.replyTo,
      ...draft,
      attachmentsAvailable: { cv: Boolean(context.attachments.cv), coverLetter: Boolean(context.attachments.letter) },
      canSendFromNaruvi: context.canSend,
      note: "Draft only. The user reviews and sends it from the application's email composer in Naruvi.",
    }
  },

  async saveJobLead({ url, title, text }) {
    const known = canonicalJobUrl(url)
    const id = await saveCapture({ url: known?.url ?? url, board: known?.board ?? new URL(url).hostname.replace(/^www\./, ""), title: title.trim(), text: text.trim() })
    refresh()
    return { leadId: id, note: "Saved to Job leads for the user to review." }
  },

  async addJob({ url, text }) {
    const draft = await previewJob({ url: url ?? "", text: text ?? "", html: "" })
    const duplicates = await findDuplicates(draft).catch(() => [])
    if (duplicates.length) return { saved: false, duplicates: duplicates.slice(0, 3).map((item) => ({ jobId: item.id, title: item.title, company: item.company, status: item.status })), note: "Already saved; nothing added." }
    const saved = await saveAndTrackJob(draft)
    refresh()
    return { saved: true, jobId: saved.id, applicationId: saved.applicationId, title: draft.title, company: draft.company, fitCheckRunning: saved.checking }
  },
}

