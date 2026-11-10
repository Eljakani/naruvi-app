import "server-only"
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, notInArray } from "drizzle-orm"
import { db } from "@/server/db/client"
import { applications, companies, jobLeads, jobs, mailMessages, runs, settings } from "@/server/db/schema"
import { getTranslations } from "next-intl/server"

/** In-app notifications, derived from what already happened. Nothing extra is stored except when you last looked. */
export type InboxItem = {
  id: string
  kind: "interview" | "offer" | "rejection" | "reply" | "due" | "leads" | "done" | "failed"
  title: string
  body: string
  href: string
  at: string
}

const SEEN_KEY = "notifications.seenAt"
// Titles are in the `inbox` message catalog, in the reader's language.
const REPLY_KIND = { interview: "interview", offer: "offer", rejection: "rejection", info_request: "reply" } as const satisfies Record<string, InboxItem["kind"]>
const WORK_DONE = { "application.analyze": "analyze", "cv.generate": "cv", "letter.generate": "letter", "company.research": "research" } as const

export async function inbox() {
  const t = await getTranslations("inbox")
  const at = (title: string, company: string | null) => (company ? t("at", { title, company }) : title)
  const since = new Date(Date.now() - 7 * 86_400_000)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const [replies, due, leads, work, [seen]] = await Promise.all([
    db.select({ id: mailMessages.id, kind: mailMessages.kind, from: mailMessages.fromName, subject: mailMessages.subject, applicationId: mailMessages.applicationId, createdAt: mailMessages.createdAt, title: jobs.title, company: companies.name })
      .from(mailMessages)
      .innerJoin(applications, eq(applications.id, mailMessages.applicationId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(eq(mailMessages.direction, "in"), gte(mailMessages.createdAt, since)))
      .orderBy(desc(mailMessages.createdAt)).limit(20),
    db.select({ id: applications.id, nextStep: applications.nextStep, dueAt: applications.nextStepDue, title: jobs.title, company: companies.name })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(isNotNull(applications.nextStepDue), lt(applications.nextStepDue, end), isNull(applications.archivedAt), notInArray(applications.status, ["rejected", "withdrawn"])))
      .limit(20),
    db.select({ createdAt: jobLeads.createdAt }).from(jobLeads).where(and(eq(jobLeads.state, "new"), gte(jobLeads.createdAt, since))).orderBy(desc(jobLeads.createdAt)),
    db.select({ id: runs.id, workflow: runs.workflow, status: runs.status, applicationId: runs.applicationId, finishedAt: runs.finishedAt, title: jobs.title, company: companies.name })
      .from(runs)
      .leftJoin(applications, eq(applications.id, runs.applicationId))
      .leftJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(inArray(runs.workflow, Object.keys(WORK_DONE)), inArray(runs.status, ["succeeded", "failed"]), gte(runs.finishedAt, since)))
      .orderBy(desc(runs.finishedAt)).limit(20),
    db.select({ value: settings.value }).from(settings).where(eq(settings.key, SEEN_KEY)),
  ])

  const items: InboxItem[] = []
  for (const reply of replies) {
    const known = (reply.kind ?? "") in REPLY_KIND ? (reply.kind as keyof typeof REPLY_KIND) : null
    const kind: InboxItem["kind"] = known ? REPLY_KIND[known] : "reply"
    const title = known ? t(`reply.${known}`) : t("replyFrom", { from: reply.from || t("aRecruiter") })
    items.push({ id: `reply:${reply.id}`, kind, title, body: `${at(reply.title, reply.company)}${reply.subject ? ` · ${reply.subject}` : ""}`, href: `/applications/${reply.applicationId}`, at: reply.createdAt.toISOString() })
  }
  const today = new Date().toISOString().slice(0, 10)
  for (const item of due) {
    // Due items count as new each morning, so a step you skipped yesterday nudges again today.
    const morning = new Date(); morning.setHours(0, 0, 0, 0)
    items.push({ id: `due:${item.id}:${today}`, kind: "due", title: item.dueAt! < morning ? t("overdue") : t("dueToday"), body: `${item.nextStep || t("nextStep")} · ${at(item.title, item.company)}`, href: `/applications/${item.id}`, at: morning.toISOString() })
  }
  if (leads.length) items.push({ id: `leads:${leads[0].createdAt.toISOString()}`, kind: "leads", title: t("leads", { count: leads.length }), body: t("leadsBody"), href: "/jobs", at: leads[0].createdAt.toISOString() })
  for (const run of work) {
    const work = WORK_DONE[run.workflow as keyof typeof WORK_DONE]
    const ok = run.status === "succeeded"
    // A success with nothing to open is noise; failures always surface.
    if (ok && !run.applicationId) continue
    items.push({ id: `run:${run.id}`, kind: ok ? "done" : "failed", title: t(`work.${work}.${ok ? "done" : "failed"}`), body: run.title ? at(run.title, run.company) : t("seeWhatWentWrong"), href: ok && run.applicationId ? `/applications/${run.applicationId}` : `/runs/${run.id}`, at: run.finishedAt!.toISOString() })
  }
  items.sort((a, b) => b.at.localeCompare(a.at))
  // Before the inbox was ever opened, only the last day counts as new, not the whole week.
  const seenAt = typeof seen?.value === "string" ? seen.value : new Date(Date.now() - 86_400_000).toISOString()
  return { items: items.slice(0, 30), seenAt }
}

export async function markInboxSeen() {
  const value = new Date().toISOString()
  await db.insert(settings).values({ key: SEEN_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  return value
}
