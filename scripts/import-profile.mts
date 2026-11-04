/** Usage: npm run profile:import -- /path/to/my-cv/profile */
import { config } from "dotenv"

config({ path: ".env.local" })

const folder = process.argv[2]
if (!folder) {
  console.error("Usage: npm run profile:import -- <profile folder containing identity.md and pools/>")
  process.exit(1)
}
const { importProfileFolder } = await import("../src/server/profile/repository")
const summary = await importProfileFolder(folder)
console.log(`Imported ${summary.entries} entries, ${summary.facts} facts, ${summary.phrasings} phrasings, ${summary.logos} logos.`)
if (summary.ungrounded.length) {
  console.log(`\n${summary.ungrounded.length} phrasing(s) need a manual fact link:`)
  for (const item of summary.ungrounded) console.log(`- [${item.entry}] ${item.text}${item.numbers.length ? `  (unbacked numbers: ${item.numbers.join(", ")})` : ""}`)
}
process.exit(0)
