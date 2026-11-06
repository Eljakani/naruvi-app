import "server-only"
import { z } from "zod"
import { CLOSED } from "@/lib/attention"
import { STATUS_LABEL, type Status } from "@/lib/stages"
import { displayFitScore } from "@/server/analysis/match"
import { getApplication, listApplications, type StoredAnalysis } from "@/server/applications/repository"
import { mailFor } from "@/server/mail/classify"
import { moveApplication, setArchived, setNextStep } from "@/server/tracking/service"
import { NotFound } from "./api"

/** Plain JSON shapes for the API and the MCP server: no internal ids beyond what clients need. */
const summary = (application: Awaited<ReturnType<typeof listApplications>>[number]) => ({
  id: application.id,
  title: application.job.title,
  company: application.job.company?.name ?? null,
  location: application.job.location || null,
  status: application.status,
  stage: STATUS_LABEL[application.status],
  fit: displayFitScore(application.analysis as StoredAnalysis | null),
  nextStep: application.nextStep || null,
  nextStepDue: application.nextStepDue?.toISOString() ?? null,
  archived: Boolean(application.archivedAt),
  updatedAt: application.updatedAt.toISOString(),
})

export const listQuery = z.object({ q: z.string().max(200).optional(), show: z.enum(["active", "closed", "archived", "all"]).default("active") })

export async function apiApplications(query: z.infer<typeof listQuery>) {
  const rows = await listApplications({ archived: query.show === "archived" ? true : query.show === "all" ? "all" : false, q: query.q })
  const filtered = query.show === "active" ? rows.filter((row) => !CLOSED.includes(row.status)) : query.show === "closed" ? rows.filter((row) => CLOSED.includes(row.status)) : rows
  return { applications: filtered.map(summary) }
}

export async function apiApplication(id: string) {
  const application = await getApplication(id)
  if (!application) throw new NotFound("Application not found.")
  const analysis = application.analysis
  const emails = await mailFor(id)
  return {
    ...summary(application),
    jobId: application.job.id,
    language: application.language,
    analysis: analysis ? { fit: displayFitScore(analysis), proven: analysis.counts.met, partial: analysis.counts.partial, missing: analysis.counts.gap } : null,
    emails: emails.map((email) => ({ direction: email.direction, from: email.fromName || email.fromAddress, subject: email.subject, date: email.sentAt.toISOString(), kind: email.kind, text: email.text.slice(0, 4000) })),
  }
}

export const updateBody = z
  .object({
    status: z.enum(["submitted", "interviewing", "offer", "rejected", "withdrawn"]).optional(),
    nextStep: z.string().max(200).optional(),
    nextStepDue: z.string().datetime({ offset: true }).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change.")

export async function apiUpdateApplication(id: string, body: z.infer<typeof updateBody>) {
  const current = await getApplication(id)
  if (!current) throw new NotFound("Application not found.")
  if (body.status) await moveApplication(id, body.status as Status, "Changed through the API")
  if (body.nextStep !== undefined || body.nextStepDue !== undefined) {
    await setNextStep(id, body.nextStep ?? current.nextStep, body.nextStepDue === undefined ? current.nextStepDue : body.nextStepDue ? new Date(body.nextStepDue) : null)
  }
  if (body.archived !== undefined) await setArchived(id, body.archived)
  return apiApplication(id)
}
