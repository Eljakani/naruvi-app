import "server-only"
import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "@/server/db/client"
import { jobLeads, jobs } from "@/server/db/schema"

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

/** A page captured by the browser extension; capturing the same page again refreshes it. */
export async function saveCapture(input: { url: string; board: string; title: string; text: string }) {
  const [row] = await db
    .insert(jobLeads)
    .values({ ...input, text: input.text || null, source: "Saved from your browser", foundAt: new Date() })
    .onConflictDoUpdate({ target: jobLeads.url, set: { title: input.title, text: input.text || null, state: "new", foundAt: new Date() } })
    .returning({ id: jobLeads.id })
  return row.id
}

export async function getLead(id: string) {
  const [row] = await db.select().from(jobLeads).where(eq(jobLeads.id, id))
  return row ?? null
}

/** New leads, minus jobs already saved and leads already seen. Returns how many were added. */
export async function addLeads(found: { url: string; title: string; board: string }[], source: string, foundAt: Date) {
  if (!found.length) return 0
  const known = await db.select({ url: jobs.sourceUrl, canonical: jobs.canonicalUrl }).from(jobs)
  const saved = new Set(known.flatMap((row) => [row.url, row.canonical]).filter(Boolean) as string[])
  const fresh = found.filter((lead) => !saved.has(lead.url))
  if (!fresh.length) return 0
  const inserted = await db.insert(jobLeads).values(fresh.map((lead) => ({ ...lead, source: source.slice(0, 300), foundAt }))).onConflictDoNothing().returning({ id: jobLeads.id })
  return inserted.length
}
