import "server-only"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { dueIn } from "@/lib/attention"

import { automaticStatus, type Status } from "@/lib/stages"
import { db } from "@/server/db/client"
import { applicationEvents, applications } from "@/server/db/schema"

const AUTO_FOLLOW_UP = "Follow up if there is no reply"
const PREPARING: Status[] = ["draft", "parsed", "analyzed", "generated", "ready"]

/** Set a status by hand (board, menu). Records the change. */
export async function moveApplication(id: string, to: Status, note = "") {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ status: applications.status, nextStep: applications.nextStep, nextStepDue: applications.nextStepDue }).from(applications).where(eq(applications.id, id)).for("update")
    if (!current) throw new Error("Application not found.")
    if (current.status === to) return { changed: false }
    // Sending without a plan: suggest a follow-up in a week (editable, clearable).
    const followUp =
      to === "submitted" && !current.nextStep && !current.nextStepDue
        ? { nextStep: AUTO_FOLLOW_UP, nextStepDue: dueIn(7, Date.now()) }
        : // Moved back before it was sent: drop the automatic follow-up if untouched.
          current.status === "submitted" && PREPARING.includes(to) && current.nextStep === AUTO_FOLLOW_UP
          ? { nextStep: "", nextStepDue: null }
          : {}
    await tx.update(applications).set({ status: to, ...followUp }).where(eq(applications.id, id))
    await tx.insert(applicationEvents).values({ applicationId: id, fromStatus: current.status, toStatus: to, actor: "user", note })
    return { changed: true }
  })
}

/** Status change from an automatic step; never moves a sent/closed application. */
export async function advanceAutomatically(id: string, next: Status) {
  const [current] = await db.select({ status: applications.status }).from(applications).where(eq(applications.id, id))
  if (!current) return
  const to = automaticStatus(current.status, next)
  if (to === current.status) return
  await db.update(applications).set({ status: to }).where(eq(applications.id, id))
  await db.insert(applicationEvents).values({ applicationId: id, fromStatus: current.status, toStatus: to, actor: "system" })
}

export async function listEvents(applicationId: string) {
  return db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, applicationId)).orderBy(desc(applicationEvents.createdAt))
}

/** When each application entered its current status (latest event, else creation). */
export async function stageSince() {
  const rows = await db.selectDistinctOn([applicationEvents.applicationId], { applicationId: applicationEvents.applicationId, at: applicationEvents.createdAt }).from(applicationEvents).orderBy(applicationEvents.applicationId, desc(applicationEvents.createdAt))
  return new Map(rows.map((row) => [row.applicationId, row.at]))
}

/** Put an application away (or bring it back). Nothing is deleted. */
export async function setArchived(id: string, archived: boolean) {
  const [row] = await db.update(applications).set({ archivedAt: archived ? new Date() : null }).where(eq(applications.id, id)).returning({ id: applications.id })
  if (!row) throw new Error("Application not found.")
}

/** What to do next and when; an empty text and no date clears it. */
export async function setNextStep(id: string, nextStep: string, due: Date | null) {
  const [row] = await db.update(applications).set({ nextStep: nextStep.trim().slice(0, 200), nextStepDue: due }).where(eq(applications.id, id)).returning({ id: applications.id })
  if (!row) throw new Error("Application not found.")
}

export async function archiveMany(ids: string[]) {
  if (!ids.length) return
  await db.update(applications).set({ archivedAt: new Date() }).where(and(inArray(applications.id, ids), isNull(applications.archivedAt)))
}
