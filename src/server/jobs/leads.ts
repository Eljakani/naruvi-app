import "server-only"
import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/server/db/client"
import { jobLeads } from "@/server/db/schema"

export async function newLeads(limit = 30) {
  return db.select().from(jobLeads).where(eq(jobLeads.state, "new")).orderBy(desc(jobLeads.foundAt)).limit(limit)
}

export async function dismissLead(id: string) {
  await db.update(jobLeads).set({ state: "dismissed" }).where(and(eq(jobLeads.id, id), eq(jobLeads.state, "new")))
}

/** A saved job came from a lead: mark it imported so it leaves the list. */
export async function markLeadImported(jobId: string, urls: (string | null | undefined)[]) {
  const list = urls.filter(Boolean) as string[]
  if (list.length) await db.update(jobLeads).set({ state: "imported", jobId }).where(inArray(jobLeads.url, list))
}
