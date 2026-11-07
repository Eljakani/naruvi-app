import "server-only"
import { randomUUID } from "node:crypto"
import MailComposer from "nodemailer/lib/mail-composer"
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm"
import { z } from "zod"
import { composeDraft, parseAddresses, type ComposeKind } from "@/lib/mail-templates"
import type { Status } from "@/lib/stages"
import { db } from "@/server/db/client"
import { applications, companies, documents, entries, facts, jobs, mailMessages, profiles, revisions } from "@/server/db/schema"
import { contactsForApplication } from "@/server/contacts/repository"
import { revisionPdf } from "@/server/documents/service"
import { startRun } from "@/server/runs/tracer"
import { moveApplication } from "@/server/tracking/service"
import { ruleKind } from "@/lib/mail-classify"
import { replyAddress } from "@/lib/mail-match"
import { explainMailError, getMailAccount, getReplySetting, imapClient, smtpTransport } from "./account"

import { getLlmOverview } from "@/server/settings/llm"
import { completionForRun } from "@/server/llm/client"
import { draftMailInput, type DraftMailInput } from "@/lib/mail-draft"
import { MAIL_DRAFT_PROMPT_VERSION, writeMailDraft } from "./ai-compose"

import { sendResendMail } from "./resend"

const PREPARING: Status[] = ["draft", "parsed", "analyzed", "generated", "ready"]

/** What the compose dialog needs: who to write to, the documents to attach, and a draft. */
export async function composeContext(applicationId: string, kind: ComposeKind, replyToId?: string | null) {
  const [app] = await db
    .select({ id: applications.id, status: applications.status, language: applications.language, nextStep: applications.nextStep, title: jobs.title, company: companies.name })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(applications.id, applicationId))
  if (!app) return null
  const account = await getMailAccount().catch(() => null)
  const docs = await db
    .select({ kind: documents.kind, language: documents.language, revisionId: documents.currentRevisionId, content: revisions.content })
    .from(documents)
    .innerJoin(revisions, eq(revisions.id, documents.currentRevisionId))
    .where(eq(documents.applicationId, applicationId))
  const pick = (kind: "cv" | "cover_letter") => docs.find((doc) => doc.kind === kind && doc.language === app.language) ?? docs.find((doc) => doc.kind === kind)
  const cv = pick("cv")
  const letter = pick("cover_letter")
  const name = ((cv?.content ?? letter?.content) as { header?: { name?: string } } | null)?.header?.name || account?.displayName || ""
  // Reply in the latest thread from the company, if there is one.
  const [last] = await db
    .select({ id: mailMessages.id, fromAddress: mailMessages.fromAddress, subject: mailMessages.subject, text: mailMessages.text, fromName: mailMessages.fromName, sentAt: mailMessages.sentAt, kind: mailMessages.kind })
    .from(mailMessages)
    .where(and(eq(mailMessages.applicationId, applicationId), eq(mailMessages.direction, "in"), ...(replyToId ? [eq(mailMessages.id, replyToId)] : [])))
    .orderBy(desc(mailMessages.sentAt))
    .limit(1)
  if (replyToId && !last) throw new Error("That email is no longer available on this application.")
  const model = await getLlmOverview()
  const draft = composeDraft(kind, app.language, { name, title: app.title, company: app.company ?? "", subject: kind === "apply" ? undefined : last?.subject, attachments: { cv: Boolean(cv), letter: Boolean(letter) } })
  // No thread yet: write to the person linked to this application.
  const [person] = (await contactsForApplication(applicationId)).filter((contact) => contact.email)
  return {
    application: { company: app.company ?? "", title: app.title, language: app.language, nextStep: app.nextStep },
    aiConfigured: model.configured,
    latestEmail: last ? { id: last.id, from: last.fromName || last.fromAddress, address: last.fromAddress, subject: last.subject, text: last.text.slice(0, 8000), date: last.sentAt.toISOString(), kind: last.kind } : null,
    canSend: Boolean(account && (account.provider === "resend" || account.smtpHost)),
    from: account ? `${account.displayName || name} <${account.email}>` : null,
    to: (kind === "apply" ? "" : (last?.fromAddress ?? "")) || person?.email || "",
    replyTo: kind === "apply" ? null : (last?.id ?? null),
    subject: draft.subject,
    body: draft.body,
    attachments: { cv: cv?.revisionId ?? null, letter: letter?.revisionId ?? null },
    status: app.status,
  }
}
export type ComposeContext = NonNullable<Awaited<ReturnType<typeof composeContext>>>

/** Draft only: no mailbox transport is called and no email is sent. */
export async function draftApplicationMail(raw: DraftMailInput) {
  const input = draftMailInput.parse(raw)
  const [app] = await db.select({ profileId: applications.profileId, selectedFactIds: applications.selectedFactIds, name: profiles.fullName, company: companies.name, title: jobs.title, language: applications.language, status: applications.status, nextStep: applications.nextStep, notes: applications.notes, jobText: jobs.rawText })
    .from(applications).innerJoin(jobs, eq(jobs.id, applications.jobId)).innerJoin(profiles, eq(profiles.id, applications.profileId)).leftJoin(companies, eq(companies.id, jobs.companyId)).where(eq(applications.id, input.applicationId))
  if (!app) throw new Error("Application not found.")
  // A specific Reply button anchors generation to that email, not a newer unrelated exchange.
  let through: Date | null = null
  if (input.replyTo) {
    const [parent] = await db.select({ sentAt: mailMessages.sentAt }).from(mailMessages).where(and(eq(mailMessages.id, input.replyTo), eq(mailMessages.applicationId, input.applicationId), eq(mailMessages.direction, "in")))
    if (!parent) throw new Error("That email is no longer available on this application.")
    through = parent.sentAt
  }
  const recent = await db.select({ direction: mailMessages.direction, sender: mailMessages.fromName, subject: mailMessages.subject, text: mailMessages.text, sentAt: mailMessages.sentAt })
    .from(mailMessages).where(and(eq(mailMessages.applicationId, input.applicationId), ...(through ? [lte(mailMessages.sentAt, through)] : []))).orderBy(desc(mailMessages.sentAt)).limit(8)
  const thread = recent.filter((message) => !through || message.sentAt <= through).slice(0, 8).reverse().map((message) => ({ ...message, date: message.sentAt.toISOString() }))
  const verified = await db.select({ statement: facts.statement, restrictions: entries.doNotClaim }).from(facts).innerJoin(entries, eq(entries.id, facts.entryId))
    .where(and(eq(entries.profileId, app.profileId), eq(entries.status, "verified"), eq(entries.confidential, false), ...(app.selectedFactIds.length ? [inArray(facts.id, app.selectedFactIds)] : []))).orderBy(asc(entries.sortOrder), asc(facts.sortOrder)).limit(40)
  const run = await startRun("mail.draft", { kind: input.kind, messages: thread.length, facts: verified.length }, input.applicationId)
  try {
    const draft = await writeMailDraft(input, { name: app.name, company: app.company ?? "", title: app.title, language: app.language, status: app.status, nextStep: app.nextStep, notes: app.notes, jobText: app.jobText, today: new Date().toISOString().slice(0, 10), thread, facts: verified }, completionForRun(run, "email draft", MAIL_DRAFT_PROMPT_VERSION))
    await run.finish("succeeded", { model: draft.model, missingDetails: draft.missingDetails.length })
    return draft
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}

export const sendInput = z.object({
  applicationId: z.string().uuid(),
  kind: z.enum(["apply", "follow_up", "thank_you", "reply"]),
  to: z.string().max(2000),
  cc: z.string().max(2000).default(""),
  subject: z.string().trim().min(1, "Add a subject").max(300),
  body: z.string().trim().min(1, "Write a message").max(20_000),
  attachCv: z.boolean(),
  attachLetter: z.boolean(),
  replyTo: z.string().uuid().nullable(),
})

/**
 * Send one email from the connected mailbox, keep a copy in its Sent folder
 * and on the application. Sending an application marks it as sent.
 */
export async function sendApplicationMail(raw: z.input<typeof sendInput>) {
  const input = sendInput.parse(raw)
  const to = parseAddresses(input.to)
  const cc = parseAddresses(input.cc)
  if (!to.length) throw new Error("Add at least one valid recipient.")
  const account = await getMailAccount()
  if (!account || (account.provider !== "resend" && !account.smtpHost)) throw new Error("Set up outgoing email on the Integrations page first.")
  const context = await composeContext(input.applicationId, input.kind, input.replyTo)
  if (!context) throw new Error("Application not found.")

  const attachments: { filename: string; content: Buffer; contentType: string }[] = []
  for (const revisionId of [input.attachCv ? context.attachments.cv : null, input.attachLetter ? context.attachments.letter : null]) {
    if (!revisionId) continue
    const pdf = await revisionPdf(revisionId)
    if (pdf) attachments.push({ filename: pdf.name, content: Buffer.from(pdf.buffer), contentType: "application/pdf" })
  }

  let threading: { inReplyTo?: string; references?: string[] } = {}
  if (input.replyTo) {
    const [parent] = await db.select({ messageId: mailMessages.messageId, references: mailMessages.references }).from(mailMessages).where(and(eq(mailMessages.id, input.replyTo), eq(mailMessages.applicationId, input.applicationId)))
    if (parent) threading = { inReplyTo: parent.messageId, references: [...parent.references, parent.messageId] }
  }

  let messageId = `<${randomUUID()}@${account.email.split("@")[1] ?? "naruvi.local"}>`
  // Replies come back to this application's own address (it still lands in your inbox).
  const replyTo = account.provider === "resend"
    ? replyAddress(input.applicationId, account.username, { mode: "plus" })
    : replyAddress(input.applicationId, account.email, await getReplySetting())
  const mail = {
    from: { name: account.displayName || context.from?.split(" <")[0] || "", address: account.email },
    to,
    cc: cc.length ? cc : undefined,
    subject: input.subject,
    text: input.body,
    attachments,
    messageId,
    ...(replyTo ? { replyTo } : {}),
    ...threading,
  }
  const run = await startRun("mail.send", { kind: input.kind, recipients: to.length + cc.length, attachments: attachments.length }, input.applicationId)
  try {
    if (account.provider === "resend") {
      messageId = await run.step("send via Resend", () => sendResendMail(account.accessToken ?? account.password, {
        from: mail.from.name ? `${mail.from.name} <${account.email}>` : account.email,
        to,
        cc: mail.cc,
        subject: input.subject,
        text: input.body,
        reply_to: replyTo ?? account.username,
        attachments: attachments.map(({ filename, content, contentType }) => ({ filename, content: content.toString("base64"), content_type: contentType })),
        headers: threading.inReplyTo ? { "In-Reply-To": threading.inReplyTo, References: threading.references?.join(" ") ?? "" } : undefined,
      }), () => `${attachments.length} attachment(s)`)
    } else {
      await run.step("send over SMTP", async () => {
        try {
          return await smtpTransport(account).sendMail(mail)
        } catch (error) {
          throw new Error(explainMailError(error))
        }
      }, () => `${attachments.length} attachment(s)`)
      // A copy in the mailbox's Sent folder, like any mail client. Best effort.
      await run.step("save to Sent folder", async () => {
        const raw = await new MailComposer({ ...mail, date: new Date() }).compile().build()
        const client = imapClient(account)
        try {
          await client.connect()
          const folders = await client.list()
          const sent = folders.find((folder) => folder.specialUse === "\\Sent")?.path ?? folders.find((folder) => /^(sent|sent items|sent mail|envoyés|gesendet)$/i.test(folder.name))?.path
          if (sent) await client.append(sent, raw, ["\\Seen"])
          await client.logout()
          return sent ?? "no Sent folder"
        } catch {
          client.close()
          return "skipped"
        }
      }, (folder) => String(folder))
    }
    const [saved] = await db.insert(mailMessages).values({
      accountId: account.id,
      applicationId: input.applicationId,
      messageId,
      inReplyTo: threading.inReplyTo ?? null,
      references: threading.references ?? [],
      folder: "Sent",
      direction: "out",
      fromAddress: account.email,
      fromName: mail.from.name,
      toAddresses: [...to, ...cc],
      subject: input.subject,
      sentAt: new Date(),
      text: input.body,
      matchReason: "Sent from Naruvi",
      kind: input.kind,
      readAt: new Date(),
    }).returning({ id: mailMessages.id })
    if (input.kind === "apply" && PREPARING.includes(context.status)) await moveApplication(input.applicationId, "submitted", "Sent by email from Naruvi")
    await run.finish("succeeded", { kind: input.kind })
    return { sentMessageId: saved.id, interviewRelated: ["reply", "follow_up"].includes(input.kind) && !["offer", "rejected", "withdrawn"].includes(context.status) && Boolean(context.latestEmail && (context.latestEmail.kind === "interview" || (!context.latestEmail.kind && ruleKind(context.latestEmail.subject, context.latestEmail.text) === "interview"))) }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    throw error
  }
}
