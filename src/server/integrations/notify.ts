import "server-only"
import { and, eq, gte, inArray, isNotNull, isNull, lt, notInArray } from "drizzle-orm"
import { z } from "zod"
import { env } from "@/lib/env"
import { db } from "@/server/db/client"
import { applications, companies, jobLeads, jobs, mailMessages, notificationLog, settings } from "@/server/db/schema"
import { decryptSecret, encryptSecret, encryptionReady } from "@/server/settings/encryption"
import { SettingsError } from "@/server/settings/errors"

const KEY = "integration.notifications"

const stored = z.object({
  server: z.string().url(),
  topic: z.string().regex(/^[\w-]{1,64}$/),
  encryptedToken: z.string().nullable().default(null),
  private: z.boolean().default(false),
  events: z.object({ replies: z.boolean().default(true), due: z.boolean().default(true), leads: z.boolean().default(true) }).default({ replies: true, due: true, leads: true }),
})
type Stored = z.infer<typeof stored>

export const notificationInput = z.object({
  server: z.string().trim().url("Enter the server address, like https://ntfy.sh").refine((url) => /^https?:\/\//.test(url), "Use http or https"),
  topic: z.string().trim().regex(/^[\w-]{1,64}$/, "Use letters, numbers, - and _ only"),
  /** Empty keeps the saved token. */
  token: z.string().max(500).default(""),
  removeToken: z.boolean().default(false),
  private: z.boolean(),
  events: z.object({ replies: z.boolean(), due: z.boolean(), leads: z.boolean() }),
})

async function read(): Promise<Stored | null> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, KEY) })
  const parsed = stored.safeParse(row?.value)
  return parsed.success ? parsed.data : null
}

/** For the settings card: never the token itself. */
export async function notificationOverview() {
  const value = await read()
  return value ? { enabled: true as const, server: value.server, topic: value.topic, hasToken: Boolean(value.encryptedToken), private: value.private, events: value.events } : { enabled: false as const }
}
export type NotificationOverview = Awaited<ReturnType<typeof notificationOverview>>

export async function saveNotifications(raw: z.input<typeof notificationInput>) {
  const input = notificationInput.parse(raw)
  const previous = await read()
  const server = input.server.replace(/\/+$/, "")
  let encryptedToken = input.removeToken ? null : (previous?.encryptedToken ?? null)
  if (input.token) {
    if (!encryptionReady(env.SETTINGS_ENCRYPTION_KEY)) throw new SettingsError("Set SETTINGS_ENCRYPTION_KEY first (npm run settings:key).")
    encryptedToken = encryptSecret(input.token, env.SETTINGS_ENCRYPTION_KEY, `ntfy:${server}`)
  } else if (encryptedToken && previous && previous.server !== server) {
    encryptedToken = encryptSecret(decryptSecret(encryptedToken, env.SETTINGS_ENCRYPTION_KEY, `ntfy:${previous.server}`), env.SETTINGS_ENCRYPTION_KEY, `ntfy:${server}`)
  }
  const value: Stored = { server, topic: input.topic, encryptedToken, private: input.private, events: input.events }
  await db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  return notificationOverview()
}

export async function disableNotifications() {
  await db.delete(settings).where(eq(settings.key, KEY))
}

type Push = { title: string; message: string; click?: string; tags?: string[]; priority?: 1 | 2 | 3 | 4 | 5 }

async function send(config: Stored, push: Push) {
  const token = config.encryptedToken ? decryptSecret(config.encryptedToken, env.SETTINGS_ENCRYPTION_KEY, `ntfy:${config.server}`) : ""
  // JSON publishing keeps titles and messages in any language intact.
  const res = await fetch(config.server, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ topic: config.topic, title: push.title, message: push.message, tags: push.tags, priority: push.priority ?? 3, ...(push.click ? { click: push.click } : {}) }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new SettingsError(`The notification server answered ${res.status}. Check the address, topic and token.`)
}

export async function sendTestNotification() {
  const config = await read()
  if (!config) throw new SettingsError("Turn notifications on first.")
  await send(config, { title: "Naruvi", message: "Notifications work. You’ll hear about new replies, due next steps and job leads here.", tags: ["white_check_mark"] })
}

/** Push each event once; remember it even if the server rejects it, to avoid floods. */
async function once(key: string, config: Stored, push: Push) {
  const [inserted] = await db.insert(notificationLog).values({ key }).onConflictDoNothing().returning({ key: notificationLog.key })
  if (!inserted) return false
  await send(config, push).catch((error) => console.error("[notify]", error instanceof Error ? error.message : error))
  return true
}

const KIND_TITLE: Record<string, string> = { interview: "Interview invitation", offer: "Job offer", rejection: "Reply: not moving forward", info_request: "They need more information" }

/** Called from the background timer and after each mail sync. */
export async function runNotifications(origin = process.env.NARUVI_URL ?? "http://localhost:3000") {
  const config = await read()
  if (!config) return 0
  let sent = 0
  const label = (title: string, company: string | null) => (config.private ? "an application" : `${title}${company ? ` at ${company}` : ""}`)

  if (config.events.replies) {
    const replies = await db
      .select({ id: mailMessages.id, kind: mailMessages.kind, applicationId: mailMessages.applicationId, title: jobs.title, company: companies.name })
      .from(mailMessages)
      .innerJoin(applications, eq(applications.id, mailMessages.applicationId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(eq(mailMessages.direction, "in"), inArray(mailMessages.kind, Object.keys(KIND_TITLE)), gte(mailMessages.createdAt, new Date(Date.now() - 2 * 86_400_000))))
    for (const reply of replies) {
      if (await once(`reply:${reply.id}`, config, { title: KIND_TITLE[reply.kind!], message: `New email about ${label(reply.title, reply.company)}.`, click: `${origin}/applications/${reply.applicationId}`, tags: [reply.kind === "offer" ? "tada" : reply.kind === "interview" ? "calendar" : "envelope"], priority: reply.kind === "interview" || reply.kind === "offer" ? 4 : 3 })) sent += 1
    }
  }

  if (config.events.due) {
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    const today = new Date().toISOString().slice(0, 10)
    const due = await db
      .select({ id: applications.id, nextStep: applications.nextStep, title: jobs.title, company: companies.name })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(isNotNull(applications.nextStepDue), lt(applications.nextStepDue, end), isNull(applications.archivedAt), notInArray(applications.status, ["rejected", "withdrawn"])))
    for (const item of due) {
      if (await once(`due:${item.id}:${today}`, config, { title: "Due today", message: `${config.private ? "Next step" : item.nextStep || "Next step"} for ${label(item.title, item.company)}.`, click: `${origin}/applications/${item.id}`, tags: ["alarm_clock"] })) sent += 1
    }
  }

  if (config.events.leads) {
    const fresh = await db.select({ id: jobLeads.id }).from(jobLeads).where(and(eq(jobLeads.state, "new"), gte(jobLeads.createdAt, new Date(Date.now() - 86_400_000))))
    const unseen = []
    for (const lead of fresh) {
      const [row] = await db.insert(notificationLog).values({ key: `lead:${lead.id}` }).onConflictDoNothing().returning({ key: notificationLog.key })
      if (row) unseen.push(lead.id)
    }
    if (unseen.length) {
      await send(config, { title: "New job leads", message: `${unseen.length} new posting${unseen.length === 1 ? "" : "s"} from your job alerts.`, click: `${origin}/jobs`, tags: ["briefcase"] }).catch((error) => console.error("[notify]", error instanceof Error ? error.message : error))
      sent += 1
    }
  }
  return sent
}
