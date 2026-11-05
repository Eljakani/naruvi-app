/** Computes insights for every saved job that has none yet (or all with --all). */
import { config } from "dotenv"
config({ path: ".env.local", quiet: true })
const { db } = await import("../src/server/db/client")
const { refreshJobInsights } = await import("../src/server/jobs/insights")
const all = process.argv.includes("--all")
const rows = await db.query.jobs.findMany({ columns: { id: true, title: true, insights: true } })
for (const row of rows.filter((job) => all || !job.insights)) {
  const started = Date.now()
  const insights = await refreshJobInsights(row.id)
  console.log(`${row.title}: ${insights ? `${insights.engine} · ${insights.seniority} · ${insights.workMode} · ${insights.contract} · required [${insights.skills.required.join(", ")}] · nice [${insights.skills.nice.join(", ")}] · ${Date.now() - started}ms\n  ${insights.summary}` : "failed"}`)
}
process.exit(0)
