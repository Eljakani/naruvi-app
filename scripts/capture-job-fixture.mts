/**
 * Capture a golden fixture from a live posting:
 *   npm run jobs:capture -- <name> <url>
 * Stores the raw responses the parser consumes (ATS API + public page), so
 * evals run offline and deterministically. Expected values are written from
 * the current parse and MUST be reviewed by a human before committing.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
const { apiCandidates, parseJobUrl } = await import("../src/server/jobs/vendor/job-parser.js")

const [name, url] = process.argv.slice(2)
if (!name || !url) throw new Error("Usage: jobs:capture -- <name> <url>")
const dir = join("evals/jobs/fixtures", name)
await mkdir(dir, { recursive: true })
const info = parseJobUrl(url)
const sources: { kind: string; url: string; file: string }[] = []
for (const candidate of [...apiCandidates(url), { url: info.canonical || url, kind: "page" }]) {
  const response = await fetch(candidate.url, { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36", "accept-language": "en-US,en;q=0.9" } })
  if (!response.ok) {
    console.log(`skip ${candidate.kind}: ${response.status}`)
    continue
  }
  const body = await response.text()
  const file = `${candidate.kind}.${/json/i.test(response.headers.get("content-type") ?? "") ? "json" : "html"}`
  await writeFile(join(dir, file), body)
  sources.push({ kind: candidate.kind, url: candidate.url, file })
  console.log(`saved ${file} (${Math.round(body.length / 1024)} KB)`)
}
await writeFile(join(dir, "fixture.json"), `${JSON.stringify({ url, capturedAt: new Date().toISOString().slice(0, 10), sources }, null, 2)}\n`)
