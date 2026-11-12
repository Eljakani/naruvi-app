import { readFile } from "node:fs/promises"
import { join } from "node:path"
import pkg from "../../package.json"

export const APP_VERSION = pkg.version
const RELEASES = "https://api.github.com/repos/Eljakani/naruvi-app/releases/latest"
const DAY_HALF = 12 * 60 * 60 * 1000

export type Release = { version: string; date: string | null; groups: { title: string | null; items: string[] }[] }

/** CHANGELOG.md as releases: `## 1.2.0 — 2026-01-01`, optional `### Added`, `- item`. */
export async function getChangelog(): Promise<Release[]> {
  const text = await readFile(join(process.cwd(), "CHANGELOG.md"), "utf8").catch(() => "")
  const releases: Release[] = []
  for (const line of text.split("\n")) {
    const release = /^## \[?v?([\w.-]+)\]?(?:\s*[—–-]\s*(.+))?/.exec(line)
    if (release) { releases.push({ version: release[1], date: release[2]?.trim() ?? null, groups: [{ title: null, items: [] }] }); continue }
    const current = releases.at(-1)
    if (!current) continue
    const heading = /^### (.+)/.exec(line)
    if (heading) current.groups.push({ title: heading[1].trim(), items: [] })
    else if (/^[-*] /.test(line)) current.groups.at(-1)!.items.push(line.slice(2).trim())
  }
  for (const release of releases) release.groups = release.groups.filter((group) => group.items.length)
  return releases
}

const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

let cached: { at: number; value: { version: string; url: string } | null } | null = null

/** The latest published release when it is newer than this one. Checked at most twice a day; NARUVI_UPDATE_CHECK=off turns it off. */
export async function getAvailableUpdate() {
  if (process.env.NARUVI_UPDATE_CHECK === "off") return null
  if (cached && Date.now() - cached.at < DAY_HALF) return cached.value
  let value: { version: string; url: string } | null = null
  try {
    const res = await fetch(RELEASES, { headers: { accept: "application/vnd.github+json" }, cache: "no-store", signal: AbortSignal.timeout(4000) })
    if (res.ok) {
      const { tag_name, html_url } = (await res.json()) as { tag_name?: string; html_url?: string }
      const version = String(tag_name ?? "").replace(/^v/, "")
      if (version && newer(version, APP_VERSION)) value = { version, url: String(html_url) }
    }
  } catch {
    // Offline or rate-limited: say nothing rather than guess.
  }
  cached = { at: Date.now(), value }
  return value
}
