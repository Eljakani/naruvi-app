/** Live smoke test: npm run jobs:smoke -- <url> [<url>…] — prints the preview, saves nothing. */
import { config } from "dotenv"

config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })
const { previewJob } = await import("../src/server/jobs/ingest")
for (const url of process.argv.slice(2)) {
  const started = Date.now()
  try {
    const draft = await previewJob({ url })
    console.log(`\n✓ ${url}  (${((Date.now() - started) / 1000).toFixed(1)}s)`)
    console.log(`  ${draft.title} @ ${draft.company} · ${draft.location || "—"} · ${draft.language} · board=${draft.board} · conf=${draft.parseConfidence}`)
    console.log(`  site: ${draft.companyWebsite || "—"} (${draft.companyWebsiteSource})  logo: ${draft.logoPath ?? "—"} (${draft.logoSource || "none"})  text: ${draft.rawText.length} chars`)
    if (draft.warnings.length) console.log(`  warnings: ${draft.warnings.join(" | ")}`)
  } catch (error) {
    console.log(`\n✗ ${url}: ${error instanceof Error ? error.message : error}`)
  }
}
process.exit(0)
