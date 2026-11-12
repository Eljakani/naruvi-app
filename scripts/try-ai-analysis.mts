/** Manual check: rule vs AI fit review and CV polish on your latest application. Reads only; saves nothing. */
import { entryName } from "../src/lib/entry-fields"
import { config } from "dotenv"
config({ path: ".env.local", quiet: true })
const { completeJson } = await import("../src/server/llm/client")
const { db } = await import("../src/server/db/client")
const { applications, documents, revisions } = await import("../src/server/db/schema")
const { desc, eq } = await import("drizzle-orm")
const { getApplication } = await import("../src/server/applications/repository")
const { reviewAllMatches } = await import("../src/server/analysis/refine")
const { polishCv } = await import("../src/server/documents/ai-compose")
const { extractRequirementCandidates } = await import("../src/server/analysis/requirements")
const { filterRequirements } = await import("../src/server/analysis/filter")
const { indexFacts, matchRequirement } = await import("../src/server/analysis/match")
const { entries, facts } = await import("../src/server/db/schema")

const [row] = await db.select({ id: applications.id }).from(applications).orderBy(desc(applications.updatedAt)).limit(1)
const app = await getApplication(row.id)
if (!app) process.exit(0)
console.log("application:", app.job.title)
const verified = (await db.select({ id: facts.id, statement: facts.statement, entryId: entries.id, display: entries.display, fields: entries.fields, entryKind: entries.kind, entryTags: entries.tags, entrySkills: entries.skills }).from(facts).innerJoin(entries, eq(facts.entryId, entries.id)).where(eq(entries.status, "verified")))
  .map(({ display, fields, ...fact }) => ({ ...fact, entryTitle: entryName({ kind: fact.entryKind, display, fields }) }))
const extraction = extractRequirementCandidates(app.job.rawText)
const filtered = await filterRequirements(extraction, app.job.rawText, completeJson)
const indexed = indexFacts(verified)
const rules = filtered.requirements.map((r) => matchRequirement(r, indexed))
let t = Date.now()
const ai = await reviewAllMatches(rules, verified.map((f) => ({ id: f.id, statement: f.statement, entry: f.entryTitle, kind: f.entryKind })), completeJson)
const count = (list: typeof rules) => ["met", "partial", "gap", "judgement"].map((s) => `${s} ${list.filter((m) => m.status === s).length}`).join(" · ")
console.log(`\n[fit review] ${Date.now() - t}ms ${verified.length} facts, ${rules.length} requirements, ${ai.failedBatches} failed batches`)
console.log("rules:", count(rules))
console.log("AI:   ", count(ai.matches))
for (const [i, m] of ai.matches.entries()) if (m.status !== rules[i].status) console.log(` ${rules[i].status} → ${m.status}: ${m.text.slice(0, 90)}\n    ${m.note}\n    ${m.factIds.map((id) => verified.find((f) => f.id === id)?.statement.slice(0, 90)).join(" | ")}`)

const [doc] = await db.select().from(documents).where(eq(documents.applicationId, app.id)).limit(1)
if (doc?.currentRevisionId) {
  const [rev] = await db.select().from(revisions).where(eq(revisions.id, doc.currentRevisionId))
  if (rev?.content && doc.kind === "cv") {
    t = Date.now()
    const polished = await polishCv(rev.content as never, { title: app.job.title, company: app.job.company?.name ?? "", description: app.job.rawText }, completeJson)
    console.log(`\n[cv polish] ${Date.now() - t}ms reordered ${polished.reordered}, headline ${polished.headline ? `“${(rev.content as { header: { headline: string } }).header.headline}” → “${polished.doc.header.headline}”` : "kept"}`)
    for (const s of polished.doc.sections) for (const g of s.groups) console.log(`  ${s.kind}/${g.label}: ${g.values.slice(0, 8).join(", ")}`)
  }
}
process.exit(0)
