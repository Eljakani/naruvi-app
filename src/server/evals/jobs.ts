import "server-only"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { pickBest, parseSource } from "@/server/jobs/select"
import { isJobHost, resolveCompanySite } from "@/server/jobs/vendor/company-resolver"

type Fixture = {
  url: string
  sources: { kind: string; url: string; file: string }[]
  expected: { company: string; role: string; language: string; locationIncludes: string; minDescription: number; website: string | null }
}

export type EvalCheck = { name: string; pass: boolean; expected: string; actual: string }
export type EvalCase = { id: string; url: string; pass: boolean; checks: EvalCheck[]; ms: number }

const root = join(process.cwd(), "evals", "jobs", "fixtures")

/**
 * Golden job-parsing evals, fully offline (same fixtures as `npm test`).
 * Captured postings with human-checked expectations; no network.
 */
export async function runJobEvals(): Promise<EvalCase[]> {
  if (!existsSync(root)) return []
  const cases: EvalCase[] = []
  for (const name of readdirSync(root).sort()) {
    const started = Date.now()
    const fixture: Fixture = JSON.parse(readFileSync(join(root, name, "fixture.json"), "utf8"))
    const e = fixture.expected
    const checks: EvalCheck[] = []
    const check = (label: string, pass: boolean, expected: unknown, actual: unknown) => checks.push({ name: label, pass, expected: String(expected), actual: String(actual) })
    try {
      const parses = fixture.sources.map((source) => parseSource(source.kind, readFileSync(join(root, name, source.file), "utf8"), source.file.endsWith(".json") ? "application/json" : "text/html", fixture.url))
      const job = pickBest(parses)
      if (!job) throw new Error("No parse")
      check("Company", job.company === e.company, e.company, job.company)
      check("Role", job.role === e.role, e.role, job.role)
      check("Language", job.language === e.language, e.language, job.language)
      check("Location", job.location.includes(e.locationIncludes), `contains “${e.locationIncludes}”`, job.location)
      check("Description length", job.description.length >= e.minDescription, `≥ ${e.minDescription}`, job.description.length)
      check("Confidence", job.confidence >= 0.9, "≥ 0.9", job.confidence.toFixed(2))
      const page = fixture.sources.find((source) => source.kind === "page")
      const site = await resolveCompanySite(
        { company: job.company, pageUrl: fixture.url, structuredUrls: [job.companyUrl, ...job.companyLinks].filter((value) => value && !isJobHost(value)), html: page ? readFileSync(join(root, name, page.file), "utf8") : "", description: job.description },
        async () => null,
      )
      if (e.website) check("Company website", site.url === e.website, e.website, site.url ?? "none")
      check("Website is not a job board", !site.url || !isJobHost(site.url), "not a job board", site.url ?? "none")
    } catch (error) {
      check("Parses", false, "a job", error instanceof Error ? error.message : String(error))
    }
    cases.push({ id: name, url: fixture.url, pass: checks.every((item) => item.pass), checks, ms: Date.now() - started })
  }
  return cases
}
