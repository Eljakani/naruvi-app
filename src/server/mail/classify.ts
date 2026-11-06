import "server-only"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { choice } from "@/server/decisions/jev"
import { MAIL_KINDS, ruleKind, suggestFor, type MailKind } from "@/lib/mail-classify"
import type { Status } from "@/lib/stages"
import { db } from "@/server/db/client"
import { applications, companies, jobs, mailMessages } from "@/server/db/schema"
import { tracedDecide } from "@/server/runs/decisions"
import { startRun } from "@/server/runs/tracer"
import { decisionClient } from "@/server/settings/decisions"
import { moveApplication, setArchived, setNextStep } from "@/server/tracking/service"

const CONFIDENT = 0.6

/** Classify every new incoming email and attach a suggestion when it would change something. */
export async function classifyNewMail() {
  const rows = await db
    .select({ id: mailMessages.id, subject: mailMessages.subject, text: mailMessages.text, fromName: mailMessages.fromName, applicationId: mailMessages.applicationId, status: applications.status, company: companies.name })
    .from(mailMessages)
    .innerJoin(applications, eq(applications.id, mailMessages.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(isNull(mailMessages.kind), eq(mailMessages.direction, "in")))
    .limit(50)
  if (!rows.length) return 0
  const run = await startRun("mail.classify", { messages: rows.length })
  try {
    const client = await decisionClient().catch(() => null)
    const decide = client ? tracedDecide(run, client.decide, client.model) : null
    const now = Date.now()
    for (const row of rows) {
      let kind: MailKind = ruleKind(row.subject, row.text)
      let confidence = kind === "other" ? 0.4 : 0.7
      if (decide) {
        const result = await decide(
          { from: row.fromName, company: row.company, subject: row.subject, email: row.text.slice(0, 8000) },
          { kind: choice("What this email from a hiring team means for the candidate's job application", MAIL_KINDS) },
        ).catch(() => null)
        const answer = result?.answers.kind
        if (answer?.type === "choice" && answer.confidence >= CONFIDENT && Object.hasOwn(MAIL_KINDS, answer.choice)) {
          kind = answer.choice as MailKind
          confidence = answer.confidence
        }
      }
      const suggestion = suggestFor(kind, row.status as Status, row.company ?? "", now)
      await db.update(mailMessages).set({ kind, kindConfidence: confidence, suggestion, suggestionState: suggestion ? "pending" : "none" }).where(eq(mailMessages.id, row.id))
    }
    await run.finish("succeeded", { messages: rows.length, engine: decide ? "decision model" : "rules" })
    return rows.length
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

/** Apply a suggestion: status, next step (and nothing else). */
export async function acceptSuggestion(messageId: string) {
  const [message] = await db.select().from(mailMessages).where(eq(mailMessages.id, messageId))
  if (!message?.applicationId || !message.suggestion || message.suggestionState !== "pending") throw new Error("This suggestion is no longer open.")
  const { status, nextStep, nextStepDue, archive } = message.suggestion
  if (status) await moveApplication(message.applicationId, status as Status, `From email: ${message.subject}`.slice(0, 500))
  if (nextStep || nextStepDue) await setNextStep(message.applicationId, nextStep ?? "", nextStepDue ? new Date(nextStepDue) : null)
  if (archive) await setArchived(message.applicationId, true)
  await db.update(mailMessages).set({ suggestionState: "accepted", readAt: message.readAt ?? new Date() }).where(eq(mailMessages.id, messageId))
  return message.applicationId
}

export async function dismissSuggestion(messageId: string) {
  const [row] = await db.update(mailMessages).set({ suggestionState: "dismissed" }).where(and(eq(mailMessages.id, messageId), eq(mailMessages.suggestionState, "pending"))).returning({ applicationId: mailMessages.applicationId })
  return row?.applicationId ?? null
}

export async function markRead(applicationId: string) {
  await db.update(mailMessages).set({ readAt: new Date() }).where(and(eq(mailMessages.applicationId, applicationId), isNull(mailMessages.readAt)))
}

/** The email thread of one application, oldest first. */
export async function mailFor(applicationId: string) {
  return db.select().from(mailMessages).where(eq(mailMessages.applicationId, applicationId)).orderBy(mailMessages.sentAt)
}

/** Open suggestions and unread counts, for the dashboard and board. */
export async function mailInbox() {
  const pending = await db
    .select({ id: mailMessages.id, applicationId: mailMessages.applicationId, subject: mailMessages.subject, fromName: mailMessages.fromName, fromAddress: mailMessages.fromAddress, sentAt: mailMessages.sentAt, kind: mailMessages.kind, suggestion: mailMessages.suggestion, title: jobs.title, company: companies.name, logoPath: companies.logoPath })
    .from(mailMessages)
    .innerJoin(applications, eq(applications.id, mailMessages.applicationId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(mailMessages.suggestionState, "pending"), isNull(applications.archivedAt)))
    .orderBy(mailMessages.sentAt)
  const unread = await db.select({ applicationId: mailMessages.applicationId }).from(mailMessages).where(and(isNull(mailMessages.readAt), eq(mailMessages.direction, "in")))
  const counts = new Map<string, number>()
  for (const row of unread) if (row.applicationId) counts.set(row.applicationId, (counts.get(row.applicationId) ?? 0) + 1)
  // Only the newest open suggestion per application matters.
  const latest = new Map<string, (typeof pending)[number]>()
  for (const row of pending) if (row.applicationId) latest.set(row.applicationId, row)
  return { suggestions: [...latest.values()].reverse(), unread: counts }
}

export async function messagesFor(ids: string[]) {
  return ids.length ? db.select().from(mailMessages).where(inArray(mailMessages.id, ids)) : []
}
