import "server-only"
import { simpleParser } from "mailparser"
import { desc, eq, sql } from "drizzle-orm"
import { ATS_DOMAINS, baseDomain, matchMessage, type MatchCandidate } from "@/lib/mail-match"
import { db } from "@/server/db/client"
import { applications, companies, jobLeads, jobs, mailAccounts, mailMessages } from "@/server/db/schema"
import { ALERT_SENDERS, extractJobLeads } from "@/lib/job-alerts"
import { explainMailError, getMailAccount, imapClient } from "./account"

const FIRST_SYNC_LIMIT = 400
const BATCH_LIMIT = 200
const MAX_SOURCE_BYTES = 2_000_000
const MAX_TEXT = 20_000

/** Applications to match against, with the Message-IDs of mail sent from Naruvi. */
async function candidates(): Promise<MatchCandidate[]> {
  const rows = await db
    .select({ id: applications.id, status: applications.status, archivedAt: applications.archivedAt, updatedAt: applications.updatedAt, title: jobs.title, company: companies.name, website: companies.website })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
  const sent = await db.select({ applicationId: mailMessages.applicationId, messageId: mailMessages.messageId }).from(mailMessages).where(eq(mailMessages.direction, "out"))
  return rows
    .filter((row) => row.company)
    .map((row) => ({
      applicationId: row.id,
      company: row.company!,
      website: row.website,
      title: row.title,
      sentMessageIds: sent.filter((item) => item.applicationId === row.id).map((item) => item.messageId),
      active: !row.archivedAt && !["rejected", "withdrawn"].includes(row.status),
      updatedAt: row.updatedAt.getTime(),
    }))
}

const isAtsSender = (address: string) => {
  const domain = baseDomain(address.split("@")[1] ?? "")
  return ATS_DOMAINS.some((ats) => domain === baseDomain(ats))
}

export type SyncResult = { checked: number; stored: number; leads?: number; skipped?: string }

const isAlertSender = (address: string) => {
  const domain = baseDomain(address.split("@")[1] ?? "")
  return ALERT_SENDERS.some((sender) => domain === baseDomain(sender))
}

/** Job links from an alert email, minus jobs already saved or leads already seen. */
async function collectLeads(client: ReturnType<typeof imapClient>, uid: number, source: string, foundAt: Date) {
  const download = await client.download(String(uid), undefined, { uid: true, maxBytes: MAX_SOURCE_BYTES })
  const parsed = await simpleParser(download.content)
  const found = extractJobLeads(typeof parsed.html === "string" ? parsed.html : "", parsed.text ?? "")
  if (!found.length) return 0
  const known = await db.select({ url: jobs.sourceUrl, canonical: jobs.canonicalUrl }).from(jobs)
  const saved = new Set(known.flatMap((row) => [row.url, row.canonical]).filter(Boolean) as string[])
  const fresh = found.filter((lead) => !saved.has(lead.url))
  if (!fresh.length) return 0
  const inserted = await db.insert(jobLeads).values(fresh.map((lead) => ({ ...lead, source: source.slice(0, 300), foundAt }))).onConflictDoNothing().returning({ id: jobLeads.id })
  return inserted.length
}

/**
 * Read new mail from the inbox, keep only what matches an application.
 * One sync at a time (Postgres advisory lock); safe to call often.
 */
export async function syncMail(): Promise<SyncResult> {
  // A transaction-scoped lock lives on one pooled connection and is released when it ends.
  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext('naruvi:mail-sync')) as ok`)
    if (!lock?.ok) return { checked: 0, stored: 0, skipped: "A sync is already running." }
    return runSync()
  })
}

async function runSync(): Promise<SyncResult> {
  let accountId: string | null = null
  try {
    const account = await getMailAccount()
    if (!account) return { checked: 0, stored: 0, skipped: "No mailbox connected." }
    accountId = account.id
    const apps = await candidates()
    const client = imapClient(account)
    await client.connect()
    let checked = 0
    let stored = 0
    let leads = 0
    const lockBox = await client.getMailboxLock("INBOX")
    try {
      const box = client.mailbox
      const validity = box && typeof box === "object" ? String(box.uidValidity) : ""
      const previous = account.cursor.INBOX
      const fresh = !previous || previous.validity !== validity
      const range = fresh ? await client.search({ since: account.syncFrom }, { uid: true }) : await client.search({ uid: `${previous.last + 1}:*` }, { uid: true })
      // `n:*` always returns the newest message even when nothing is new.
      const uids = (range || []).filter((uid) => fresh || uid > previous.last).sort((a, b) => a - b).slice(fresh ? -FIRST_SYNC_LIMIT : 0, fresh ? undefined : BATCH_LIMIT)
      let last = fresh ? 0 : previous.last
      if (uids.length) {
        // Collect envelopes first: IMAP can't run a download while a fetch is still streaming.
        const items = await client.fetchAll(uids, { uid: true, envelope: true, internalDate: true }, { uid: true })
        for (const item of items) {
          checked += 1
          last = Math.max(last, item.uid)
          const envelope = item.envelope
          if (!envelope?.messageId) continue
          const from = envelope.from?.[0]
          const head = { fromAddress: from?.address ?? "", fromName: from?.name ?? "", subject: envelope.subject ?? "", text: "", inReplyTo: envelope.inReplyTo ?? null, references: [] as string[] }
          // Cheap pass on the envelope; hiring-system mail often names the company only in the body.
          let match = matchMessage(head, apps)
          if (!match && isAlertSender(head.fromAddress)) {
            leads += await collectLeads(client, item.uid, `${head.fromName || head.fromAddress}: ${head.subject}`, envelope.date ?? new Date())
            continue
          }
          if (!match && !head.inReplyTo && !isAtsSender(head.fromAddress)) continue
          const download = await client.download(String(item.uid), undefined, { uid: true, maxBytes: MAX_SOURCE_BYTES })
          const parsed = await simpleParser(download.content)
          const references = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []
          const message = { ...head, text: (parsed.text ?? "").slice(0, MAX_TEXT), references }
          match = matchMessage(message, apps)
          if (!match) continue
          const inserted = await db
            .insert(mailMessages)
            .values({
              accountId: account.id,
              applicationId: match.applicationId,
              messageId: envelope.messageId,
              inReplyTo: envelope.inReplyTo ?? null,
              references,
              folder: "INBOX",
              uid: item.uid,
              direction: "in",
              fromAddress: head.fromAddress,
              fromName: head.fromName,
              toAddresses: (envelope.to ?? []).map((to) => to.address ?? "").filter(Boolean),
              subject: head.subject,
              sentAt: envelope.date ?? (item.internalDate instanceof Date ? item.internalDate : new Date()),
              text: message.text,
              matchReason: match.reason,
            })
            .onConflictDoNothing()
            .returning({ id: mailMessages.id })
          stored += inserted.length
        }
      }
      await db
        .update(mailAccounts)
        .set({ cursor: { ...account.cursor, INBOX: { validity, last: Math.max(last, fresh ? 0 : previous.last) } }, lastSyncAt: new Date(), status: "ok", lastError: null })
        .where(eq(mailAccounts.id, account.id))
    } finally {
      lockBox.release()
      await client.logout().catch(() => client.close())
    }
    // Also picks up emails left unclassified earlier (no model then, or an error).
    await afterSync()
    return { checked, stored, leads }
  } catch (error) {
    if (accountId) await db.update(mailAccounts).set({ status: "error", lastError: explainMailError(error), lastSyncAt: new Date() }).where(eq(mailAccounts.id, accountId)).catch(() => {})
    throw error
  }
}

/** New messages arrived: classify them and prepare suggestions. Never fails the sync. */
async function afterSync() {
  const { classifyNewMail } = await import("./classify")
  await classifyNewMail().catch((error) => console.error("[mail] classification failed:", error instanceof Error ? error.message : error))
}

/** Latest matched messages, newest first. */
export async function recentMail(limit = 20) {
  return db.select().from(mailMessages).orderBy(desc(mailMessages.sentAt)).limit(limit)
}
