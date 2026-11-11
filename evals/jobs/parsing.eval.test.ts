/**
 * Golden evals for job parsing + company resolution, fully offline.
 * Fixtures are sanitized responses captured with `npm run jobs:capture`; the
 * expectations were checked by a human against the live postings.
 */
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"
import { pickBest, parseSource } from "../../src/server/jobs/select"
import { isJobHost, resolveCompanySite } from "../../src/server/jobs/vendor/company-resolver"

type Fixture = {
  url: string
  sources: { kind: string; url: string; file: string }[]
  expected: { company: string; role: string; language: string; locationIncludes: string; minDescription: number; website: string | null }
}

const root = join(import.meta.dirname, "fixtures")

for (const name of readdirSync(root)) {
  const fixture: Fixture = JSON.parse(readFileSync(join(root, name, "fixture.json"), "utf8"))
  test(`job eval: ${name}`, async () => {
    const parses = fixture.sources.map((source) => {
      const body = readFileSync(join(root, name, source.file), "utf8")
      return parseSource(source.kind, body, source.file.endsWith(".json") ? "application/json" : "text/html", fixture.url)
    })
    const job = pickBest(parses)!
    const e = fixture.expected
    assert.equal(job.company, e.company, "company")
    assert.equal(job.role, e.role, "role")
    assert.equal(job.language, e.language, "language")
    assert.ok(job.location.includes(e.locationIncludes), `location "${job.location}" should include "${e.locationIncludes}"`)
    assert.ok(job.description.length >= e.minDescription, `description ${job.description.length} chars < ${e.minDescription}`)
    assert.ok(job.confidence >= 0.9, `confidence ${job.confidence}`)

    const page = fixture.sources.find((source) => source.kind === "page")
    const site = await resolveCompanySite(
      {
        company: job.company,
        pageUrl: fixture.url,
        structuredUrls: [job.companyUrl, ...job.companyLinks].filter((value) => value && !isJobHost(value)),
        html: page ? readFileSync(join(root, name, page.file), "utf8") : "",
        description: job.description,
      },
      async () => null, // offline: no verification fetches
    )
    if (e.website) assert.equal(site.url, e.website, "company website")
    assert.ok(!site.url || !isJobHost(site.url), `website must never be a job board: ${site.url}`)
  })
}
