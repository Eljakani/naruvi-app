import "server-only"
import { ImapFlow } from "imapflow"
import nodemailer from "nodemailer"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { env } from "@/lib/env"
import { MAIL_PROVIDERS } from "@/lib/mail-providers"
import { db } from "@/server/db/client"
import { mailAccounts, mailMessages, settings } from "@/server/db/schema"
import { decryptSecret, encryptSecret, encryptionReady } from "@/server/settings/encryption"
import { SettingsError } from "@/server/settings/errors"

const host = z.string().trim().min(1, "Enter the server name").max(253).regex(/^[a-z0-9.-]+$/i, "Use a server name like imap.example.com")
export const mailAccountInput = z.object({
  email: z.string().trim().email("Enter your email address").max(254),
  displayName: z.string().trim().max(120).default(""),
  provider: z.string().max(40).default("other"),
  username: z.string().trim().max(254).default(""),
  /** Empty keeps the saved password. */
  password: z.string().max(500).default(""),
  imapHost: host,
  imapPort: z.coerce.number().int().min(1).max(65535),
  imapSecure: z.boolean(),
  smtpHost: host.or(z.literal("")),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
})
export type MailAccountInput = z.input<typeof mailAccountInput>

/** Proton Bridge and other local bridges use self-signed certificates on this machine only. */
const isLocal = (name: string) => /^(127\.0\.0\.1|localhost|::1)$/i.test(name)
const context = (email: string) => `mail:${email.toLowerCase()}`

type Connection = Pick<z.infer<typeof mailAccountInput>, "imapHost" | "imapPort" | "imapSecure" | "smtpHost" | "smtpPort" | "smtpSecure"> & { username: string; password: string }

export function imapClient(account: Connection) {
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    auth: { user: account.username, pass: account.password },
    logger: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    tls: { rejectUnauthorized: !isLocal(account.imapHost) },
  })
}

export function smtpTransport(account: Connection) {
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    requireTLS: !account.smtpSecure && !isLocal(account.smtpHost),
    auth: { user: account.username, pass: account.password },
    connectionTimeout: 15_000,
    tls: { rejectUnauthorized: !isLocal(account.smtpHost) },
  })
}

/** Plain-language reasons for the usual connection failures. */
export function explainMailError(error: unknown): string {
  const text = error instanceof Error ? `${error.message} ${(error as { responseText?: string }).responseText ?? ""}` : String(error)
  if (/auth|credentials|login|password|535|invalid/i.test(text)) return "The server refused the login. Check the username and use an app password, not your normal password."
  if (/ENOTFOUND|EAI_AGAIN/i.test(text)) return "That server name doesn’t exist. Check the IMAP/SMTP server names."
  if (/ECONNREFUSED/i.test(text)) return "Nothing answered on that server and port. Check the port, or start Proton Bridge if you use it."
  if (/timed? ?out|ETIMEDOUT/i.test(text)) return "The server didn’t answer in time. Check the port and your network."
  if (/certificate|self.signed|TLS|SSL/i.test(text)) return "The secure connection failed. Check the port and the SSL/TLS setting."
  return text.slice(0, 300)
}

/** Log in to IMAP (and SMTP when set) without saving anything. */
export async function testMailConnection(account: Connection) {
  const client = imapClient(account)
  try {
    await client.connect()
    const status = await client.status("INBOX", { messages: true })
    await client.logout()
    let smtp = "not set"
    if (account.smtpHost) {
      await smtpTransport(account).verify()
      smtp = "ok"
    }
    return { messages: status.messages ?? 0, smtp }
  } catch (error) {
    client.close()
    throw new SettingsError(explainMailError(error))
  }
}

/** The connected mailbox for the browser: never the password or its ciphertext. */
export async function getMailOverview() {
  const [account] = await db.select().from(mailAccounts).limit(1)
  if (!account) return { connected: false as const, encryptionReady: encryptionReady(env.SETTINGS_ENCRYPTION_KEY), providers: MAIL_PROVIDERS.map(({ id, name }) => ({ id, name })) }
  const [counts] = await db.select({ matched: sql<number>`count(*)`.mapWith(Number) }).from(mailMessages).where(eq(mailMessages.accountId, account.id))
  return {
    connected: true as const,
    encryptionReady: encryptionReady(env.SETTINGS_ENCRYPTION_KEY),
    providers: MAIL_PROVIDERS.map(({ id, name }) => ({ id, name })),
    account: {
      email: account.email, displayName: account.displayName, provider: account.provider, username: account.username,
      imapHost: account.imapHost, imapPort: account.imapPort, imapSecure: account.imapSecure,
      smtpHost: account.smtpHost, smtpPort: account.smtpPort, smtpSecure: account.smtpSecure,
      status: account.status, lastError: account.lastError, lastSyncAt: account.lastSyncAt?.toISOString() ?? null, syncFrom: account.syncFrom.toISOString(),
      matched: counts?.matched ?? 0,
    },
  }
}
export type MailOverview = Awaited<ReturnType<typeof getMailOverview>>

export async function hasMailbox() {
  const [row] = await db.select({ id: mailAccounts.id }).from(mailAccounts).limit(1)
  return Boolean(row)
}

/** Read with the password decrypted, for sync and sending only. */
export async function getMailAccount() {
  const [account] = await db.select().from(mailAccounts).limit(1)
  if (!account) return null
  return { ...account, password: decryptSecret(account.encryptedPassword, env.SETTINGS_ENCRYPTION_KEY, context(account.email)) }
}

/** Test, then save. A new connection only reads mail from now on (plus the last 30 days). */
export async function saveMailAccount(raw: MailAccountInput) {
  const input = mailAccountInput.parse(raw)
  if (!encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key), then restart Naruvi.")
  const existing = await getMailAccount().catch(() => null)
  const password = input.password || (existing && existing.email.toLowerCase() === input.email.toLowerCase() ? existing.password : "")
  if (!password) throw new SettingsError("Enter the password (an app password for most providers).")
  const username = input.username || input.email
  await testMailConnection({ ...input, username, password })
  const values = {
    email: input.email, displayName: input.displayName, provider: input.provider, username,
    encryptedPassword: encryptSecret(password, env.SETTINGS_ENCRYPTION_KEY, context(input.email)),
    imapHost: input.imapHost, imapPort: input.imapPort, imapSecure: input.imapSecure,
    smtpHost: input.smtpHost, smtpPort: input.smtpPort, smtpSecure: input.smtpSecure,
    status: "ok", lastError: null,
  }
  if (existing) {
    const changedMailbox = existing.email.toLowerCase() !== input.email.toLowerCase() || existing.imapHost !== input.imapHost
    await db.update(mailAccounts).set({ ...values, ...(changedMailbox ? { cursor: {} } : {}) }).where(eq(mailAccounts.id, existing.id))
  } else {
    await db.insert(mailAccounts).values({ ...values, syncFrom: new Date(Date.now() - 30 * 86_400_000) })
  }
  return getMailOverview()
}

/** Disconnect: removes the account and every stored message. */
export async function deleteMailAccount() {
  await db.delete(mailAccounts)
}

const REPLY_KEY = "integration.replyAddress"
export const replySetting = z.object({ mode: z.enum(["off", "plus", "domain"]).default("off"), domain: z.string().trim().toLowerCase().regex(/^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "Enter a domain like jobs.example.org").optional() })
export type ReplySetting = z.infer<typeof replySetting>

export async function getReplySetting(): Promise<ReplySetting> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, REPLY_KEY) })
  return replySetting.safeParse(row?.value ?? {}).data ?? { mode: "off" }
}

export async function saveReplySetting(raw: unknown) {
  const value = replySetting.parse(raw)
  if (value.mode === "domain" && !value.domain) throw new SettingsError("Enter the domain that forwards to your mailbox.")
  await db.insert(settings).values({ key: REPLY_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  return value
}
