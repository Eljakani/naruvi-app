import "server-only"
import { desc, eq } from "drizzle-orm"
import { automaticStatus, type Status } from "@/lib/stages"
import { db } from "@/server/db/client"
import { applicationEvents, applications } from "@/server/db/schema"

/** Set a status by hand (board, menu). Records the change. */
export async function moveApplication(id: string, to: Status, note = "") {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ status: applications.status }).from(applications).where(eq(applications.id, id)).for("update")
    if (!current) throw new Error("Application not found.")
    if (current.status === to) return { changed: false }
    await tx.update(applications).set({ status: to }).where(eq(applications.id, id))
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
