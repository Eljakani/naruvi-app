import "server-only"
import { simpleParser } from "mailparser"
import { and, desc, eq, sql } from "drizzle-orm"
import { baseDomain, matchMessage, type MatchCandidate } from "@/lib/mail-match"
import { db } from "@/server/db/client"
import { applicationContacts, applications, companies, contacts, jobs, mailAccounts, mailMessages } from "@/server/db/schema"
import { ALERT_SENDERS, extractJobLeads } from "@/lib/job-alerts"
import { addLeads } from "@/server/jobs/leads"
import { visiblePageText } from "@/server/research/extract"
import { getResendMail, listResendMail } from "./resend"
import { explainMailError, getMailAccount, imapClient } from "./account"

const FIRST_SYNC_LIMIT = 400
const BATCH_LIMIT = 200
const MAX_SOURCE_BYTES = 2_000_000
const MAX_TEXT = 20_000
const RESCAN_WINDOW_MS = 30 * 86_400_000
/** `wait`: queue behind a sync already in progress (manual "check now") instead of skipping. */
type SyncOptions = { rescan?: boolean; wait?: boolean }

/** Applications with known contacts and both sides of their email threads. */
async function candidates(): Promise<MatchCandidate[]> {
  const rows = await db
    .select({ id: applications.id, companyId: companies.id, status: applications.status, archivedAt: applications.archivedAt, updatedAt: applications.updatedAt, title: jobs.title, company: companies.name, website: companies.website })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
  const sent = await db.select({ applicationId: mailMessages.applicationId, messageId: mailMessages.messageId }).from(mailMessages)
  const people = await db.select({ name: contacts.name, email: contacts.email, companyId: contacts.companyId, applicationId: applicationContacts.applicationId })
    .from(contacts).leftJoin(applicationContacts, eq(applicationContacts.contactId, contacts.id))
  return rows
    .filter((row) => row.company)
    .map((row) => ({
      applicationId: row.id,
      company: row.company!,
      website: row.website,
      title: row.title,
      contactEmails: people.filter((person) => person.applicationId === row.id || (row.companyId && person.companyId === row.companyId)).map((person) => person.email).filter(Boolean),
      contactNames: people.filter((person) => person.applicationId === row.id || (row.companyId && person.companyId === row.companyId)).map((person) => person.name).filter(Boolean),
      sentMessageIds: sent.filter((item) => item.applicationId === row.id).map((item) => item.messageId),
      active: !row.archivedAt && !["rejected", "withdrawn"].includes(row.status),
      updatedAt: row.updatedAt.getTime(),
    }))
}

export type SyncResult = { checked: number; stored: number; leads?: number; skipped?: string }

const isAlertSender = (address: string) => {
  const domain = baseDomain(address.split("@")[1] ?? "")
  return ALERT_SENDERS.some((sender) => domain === baseDomain(sender))
}

/** Job links from an alert email, minus jobs already saved or leads already seen. */
async function collectLeads(html: string, text: string, source: string, foundAt: Date) {
  return addLeads(extractJobLeads(html, text), source, foundAt)
}

/**
 * Read new mail from the inbox, keep only what matches an application.
 * One sync at a time (Postgres advisory lock); safe to call often.
 */
export async function syncMail(options: SyncOptions = {}): Promise<SyncResult> {
  // A transaction-scoped lock lives on one pooled connection and is released when it ends.
  return db.transaction(async (tx) => {
    if (options.wait) {
      // Give up after a while rather than hang the request if the other sync is stuck.
      await tx.execute(sql`set local lock_timeout = '90s'`)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('naruvi:mail-sync'))`)
    } else {
      const [lock] = await tx.execute<{ ok: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext('naruvi:mail-sync')) as ok`)
      if (!lock?.ok) return { checked: 0, stored: 0, skipped: "A sync is already running." }
    }
    return runSync(options)
  })
}

async function runSync(options: SyncOptions): Promise<SyncResult> {
  let accountId: string | null = null
  try {
    const [row] = await db.select({ id: mailAccounts.id }).from(mailAccounts).limit(1)
    if (!row) return { checked: 0, stored: 0, skipped: "No mailbox connected." }
    // Known before signing in, so a failed token refresh is shown on the account.
    accountId = row.id
    const account = await getMailAccount()
    if (!account) return { checked: 0, stored: 0, skipped: "No mailbox connected." }
    if (account.provider === "resend") {
      const result = await syncResend(account, options)
      await afterSync()
      return result
    }
    const apps = await candidates()
    const knownMessages = await db.select({ messageId: mailMessages.messageId }).from(mailMessages).where(eq(mailMessages.accountId, account.id))
    const known = new Set(knownMessages.map((message) => message.messageId))
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
      const reviewing = fresh || options.rescan
      const since = options.rescan ? new Date(Math.max(account.syncFrom.getTime(), Date.now() - RESCAN_WINDOW_MS)) : account.syncFrom
      const range = reviewing ? await client.search({ since }, { uid: true }) : await client.search({ uid: `${previous.last + 1}:*` }, { uid: true })
      // `n:*` always returns the newest message even when nothing is new.
      const uids = (range || []).filter((uid) => reviewing || uid > previous.last).sort((a, b) => a - b).slice(reviewing ? -FIRST_SYNC_LIMIT : 0, reviewing ? undefined : BATCH_LIMIT)
      let last = fresh ? 0 : previous.last
      if (uids.length) {
        // Collect envelopes first: IMAP can't run a download while a fetch is still streaming.
        const items = await client.fetchAll(uids, { uid: true, envelope: true, internalDate: true }, { uid: true })
        for (const item of items) {
          last = Math.max(last, item.uid)
          const envelope = item.envelope
          if (!envelope?.messageId || known.has(envelope.messageId)) continue
          checked += 1
          const from = envelope.from?.[0]
          const head = { fromAddress: from?.address ?? "", fromName: from?.name ?? "", subject: envelope.subject ?? "", text: "", inReplyTo: envelope.inReplyTo ?? null, references: [] as string[], toAddresses: [...(envelope.to ?? []), ...(envelope.cc ?? [])].map((to) => to.address ?? "").filter(Boolean) }
          // Read the body even when headers do not match: recruiters may use personal
          // addresses and mention the company/role only in the message or signature.
          const download = await client.download(String(item.uid), undefined, { uid: true, maxBytes: MAX_SOURCE_BYTES })
          const parsed = await simpleParser(download.content)
          const references = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []
          const message = { ...head, text: (parsed.text || visiblePageText((typeof parsed.html === "string" ? parsed.html : "").slice(0, MAX_SOURCE_BYTES))).slice(0, MAX_TEXT), references }
          const match = matchMessage(message, apps)
          if (!match) {
            if (isAlertSender(head.fromAddress)) leads += await collectLeads(typeof parsed.html === "string" ? parsed.html : "", parsed.text ?? "", `${head.fromName || head.fromAddress}: ${head.subject}`, envelope.date ?? new Date())
            continue
          }
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
          known.add(envelope.messageId)
          apps.find((candidate) => candidate.applicationId === match.applicationId)?.sentMessageIds.push(envelope.messageId)
        }
      }
      await db
        .update(mailAccounts)
        // A bounded rescan can jump over older unseen mail. Leave an existing
        // watermark intact so background sync still processes that backlog in order.
        .set({ cursor: { ...account.cursor, INBOX: { validity, last: options.rescan && !fresh ? previous.last : last } }, lastSyncAt: new Date(), status: "ok", lastError: null })
        .where(eq(mailAccounts.id, account.id))
    } finally {
      lockBox.release()
      await client.logout().catch(() => client.close())
    }
    // Also picks up emails left unclassified earlier (no model then, or an error).
    await afterSync()
    return { checked, stored, leads }
  } catch (error) {
    if (accountId) await db.update(mailAccounts).set({ status: "error", lastError: error instanceof Error && error.message.startsWith("Resend (") ? error.message : explainMailError(error), lastSyncAt: new Date() }).where(eq(mailAccounts.id, accountId)).catch(() => {})
    throw error
  }
}

/** Resend lists newest first. Keep the watermark inclusive for messages with equal timestamps. */
async function syncResend(account: NonNullable<Awaited<ReturnType<typeof getMailAccount>>>, options: SyncOptions): Promise<SyncResult> {
  const credential = account.accessToken ?? account.password
  const since = options.rescan ? Math.max(account.syncFrom.getTime(), Date.now() - RESCAN_WINDOW_MS) : account.cursor.RESEND?.last ?? account.syncFrom.getTime()
  const inbox = account.username.toLowerCase()
  const [local, domain] = inbox.split("@")
  const alias = `${local.split("+")[0]}+nrv-`
  const addressOf = (value: string) => (value.match(/<([^<>]+)>$/)?.[1] ?? value).trim().toLowerCase()
  const apps = await candidates()
  let checked = 0
  let stored = 0
  let latest = Math.max(since, account.cursor.RESEND?.last ?? 0)
  let after: string | undefined

  while (true) {
    const page = await listResendMail(credential, after)
    for (const item of page.data) {
      const sentAt = new Date(item.created_at)
      if (sentAt.getTime() < since) break
      latest = Math.max(latest, sentAt.getTime())
      const recipients = [...item.to, ...(item.cc ?? []), ...(item.bcc ?? [])].map(addressOf)
      if (!recipients.some((address) => address === inbox || (address.startsWith(alias) && address.endsWith(`@${domain}`)))) continue

      const messageId = item.message_id || `<${item.id}@resend.invalid>`
      const [existing] = await db.select({ id: mailMessages.id }).from(mailMessages)
        .where(and(eq(mailMessages.accountId, account.id), eq(mailMessages.messageId, messageId))).limit(1)
      if (existing) continue

      checked += 1
      const message = await getResendMail(credential, item.id)
      const headers = Object.fromEntries(Object.entries(message.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]))
      const from = headers.from || message.from
      const text = (message.text || visiblePageText((message.html ?? "").slice(0, MAX_SOURCE_BYTES))).slice(0, MAX_TEXT)
      const inReplyTo = headers["in-reply-to"]?.match(/<[^<>]+>/)?.[0] ?? null
      const references = headers.references?.match(/<[^<>]+>/g) ?? []
      const normalized = {
        fromAddress: addressOf(from),
        fromName: from.includes("<") ? from.slice(0, from.lastIndexOf("<")).trim().replace(/^"|"$/g, "") : "",
        toAddresses: recipients,
        subject: message.subject ?? "",
        text, inReplyTo, references,
      }
      const match = matchMessage(normalized, apps)
      if (!match) continue
      const inserted = await db.insert(mailMessages).values({
        ...normalized, accountId: account.id, applicationId: match.applicationId,
        messageId, direction: "in", sentAt, matchReason: match.reason,
      }).onConflictDoNothing().returning({ id: mailMessages.id })
      stored += inserted.length
      apps.find((candidate) => candidate.applicationId === match.applicationId)?.sentMessageIds.push(messageId)
    }

    const tail = page.data.at(-1)
    if (!page.has_more || !tail || Date.parse(tail.created_at) < since) break
    if (tail.id === after) throw new Error("Resend returned the same inbox page twice.")
    after = tail.id
  }

  await db.update(mailAccounts).set({
    cursor: { ...account.cursor, RESEND: { validity: inbox, last: latest } },
    lastSyncAt: new Date(), status: "ok", lastError: null,
  }).where(and(eq(mailAccounts.id, account.id), eq(mailAccounts.provider, "resend"), eq(mailAccounts.encryptedPassword, account.encryptedPassword)))
  return { checked, stored }
}

/** New messages arrived: classify them and prepare suggestions. Never fails the sync. */
async function afterSync() {
  const { classifyNewMail } = await import("./classify")
  await classifyNewMail().catch((error) => console.error("[mail] classification failed:", error instanceof Error ? error.message : error))
  const { runNotifications } = await import("@/server/integrations/notify")
  await runNotifications().catch((error) => console.error("[mail] notifications failed:", error instanceof Error ? error.message : error))
}

/** Latest matched messages, newest first. */
export async function recentMail(limit = 20) {
  return db.select().from(mailMessages).orderBy(desc(mailMessages.sentAt)).limit(limit)
}
