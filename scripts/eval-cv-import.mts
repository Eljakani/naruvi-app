/**
 * Reads every invented CV in evals/profile/fixtures with the configured model
 * and scores the result against evals/profile/expected.json.
 * Usage: npm run profile:eval [-- <file filter> --rules --json out.json]
 * `--rules` scores the reader used when no model is connected.
 */
import { config } from "dotenv"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { scoreImport, type Expected, type Imported } from "../evals/profile/score"

config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })

const root = join(import.meta.dirname, "../evals/profile")
const expected: Record<string, Expected> = Object.assign({}, ...["expected.json", "expected-long.json"].map((file) => JSON.parse(readFileSync(join(root, file), "utf8"))))
const args = process.argv.slice(2)
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null
const filter = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--json")

const rules = args.includes("--rules")
const { readCvFile } = await import("../src/lib/cv-file")
const { readCvWithRules } = await import("../src/lib/cv-rules")
const { importProfileText } = await import("../src/server/profile/ai-import")
const complete = rules ? null : (await import("../src/server/llm/client")).completeJson

/** What the app does with an uploaded file; `--rules` reads it the way the app does when no model is connected. */
async function read(bytes: Uint8Array, name: string): Promise<{ ok: true; data: Imported & { unread: string[] } } | { ok: false; message: string }> {
  const file = await readCvFile(bytes, name)
  if (!file.ok) return { ok: false, message: file.problem }
  if (file.kind === "linkedin") return { ok: false, message: "read as a LinkedIn export" }
  try {
    return { ok: true, data: complete ? await importProfileText(file.text, complete, { links: file.links }) : readCvWithRules(file.text, file.links) }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

const report: Record<string, unknown> = {}
let points = 0
let total = 0
for (const file of readdirSync(join(root, "fixtures")).sort()) {
  if (filter && !file.includes(filter)) continue
  const want = expected[file]
  if (!want) continue
  const started = Date.now()
  const result = await read(new Uint8Array(readFileSync(join(root, "fixtures", file))), file)
  const seconds = Math.round((Date.now() - started) / 1000)
  if (want.error) {
    const ok = !result.ok
    points += ok ? 1 : 0
    total += 1
    console.log(`\n${file}: ${ok ? "refused as expected" : "WRONG: returned entries for an unreadable file"}${result.ok ? "" : ` — "${result.message}"`}`)
    report[file] = { refused: ok, message: result.ok ? null : result.message }
    continue
  }
  if (!result.ok) {
    const all = scoreImport(want, { language: "", identity: { fullName: "", headline: "", email: "", phone: "", location: "", links: [] }, entries: [] })
    total += all.total
    console.log(`\n${file}: FAILED — "${result.message}" (0/${all.total})`)
    report[file] = { failed: result.message, points: 0, total: all.total }
    continue
  }
  const score = scoreImport(want, result.data)
  points += score.points
  total += score.total
  console.log(`\n${file}: ${score.points}/${score.total} points · ${score.found}/${score.expected} entries found · ${score.extras.length} extra · ${seconds}s`)
  for (const problem of score.problems) console.log(`  ✗ ${problem}`)
  for (const extra of score.extras) console.log(`  + ${extra}`)
  for (const line of result.data.unread) console.log(`  ? unread: ${line}`)
  report[file] = { ...score, seconds, result: result.data }
}
console.log(`\nTOTAL ${points}/${total} (${Math.round((points / total) * 100)}%)`)
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ points, total, report }, null, 1))
process.exit(0)
