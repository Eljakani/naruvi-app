/** Manual check: runs the new AI steps against the configured model (reads data, writes only traces). */
import { config } from "dotenv"
config({ path: ".env.local", quiet: true })
const { getLlmOverview } = await import("../src/server/settings/llm")
const overview = await getLlmOverview()
console.log("model:", overview.model, "@", overview.baseUrl, "configured:", overview.configured)
if (!overview.configured) process.exit(0)
const { completeJson } = await import("../src/server/llm/client")
const { extractJobFields } = await import("../src/server/jobs/ai-extract")
const { companyAngles } = await import("../src/server/research/ai-angles")
const { suggestBullets } = await import("../src/server/profile/ai-bullets")
const { db } = await import("../src/server/db/client")

const job = process.env.SKIP_JOB ? null : await db.query.jobs.findFirst({ with: { company: true } })
if (job) {
  let t = Date.now()
  const fields = await extractJobFields(job.rawText, completeJson)
  console.log(`\n[job fields] ${Date.now() - t}ms stored: ${job.title} @ ${job.company?.name}`, fields)
  if (job.company?.website) {
    const { readCompanySite } = await import("../src/server/research/service")
    const site = await readCompanySite(job.company.website)
    t = Date.now()
    const angles = await companyAngles({ company: job.company.name, language: job.language, pages: site.pages, jobText: job.rawText, jobUrl: job.sourceUrl ?? "" }, completeJson)
    console.log(`\n[angles] ${Date.now() - t}ms from ${site.pages.length} pages`, JSON.stringify(angles.angles, null, 1))
  }
}
const { entries, facts } = await import("../src/server/db/schema")
const { eq, sql } = await import("drizzle-orm")
const [picked] = await db.select({ id: entries.id }).from(entries).innerJoin(facts, eq(facts.entryId, entries.id)).where(eq(entries.status, "verified")).groupBy(entries.id).orderBy(sql`count(*) desc`).limit(1)
const entryRow = picked ? (await db.select().from(entries).where(eq(entries.id, picked.id)))[0] : null
const entry = entryRow ? { ...entryRow, facts: await db.select().from(facts).where(eq(facts.entryId, entryRow.id)) } : null
if (entry) {
  const t = Date.now()
  const result = await suggestBullets({ kind: entry.kind, role: entry.title, organization: "", facts: entry.facts.map((f) => ({ key: f.id, statement: f.statement })), existing: [], languages: ["en", "fr"] }, completeJson)
  console.log(`\n[bullets] ${Date.now() - t}ms entry "${entry.title}" (${entry.facts.length} facts)`, JSON.stringify(result.bullets, null, 1))
}
process.exit(0)
