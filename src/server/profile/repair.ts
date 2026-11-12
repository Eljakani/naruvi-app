import "server-only"
import { and, eq, isNull, ne } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/server/db/client"
import { companies, entries, settings, type EntryDisplay } from "@/server/db/schema"
import { entryView, type EntryFields, type EntryKind } from "@/lib/entry-fields"
import { companyBrandingFromLink, slugify } from "@/server/jobs/ingest"
import { needsTranslation, translateSoon } from "@/server/profile/auto-translate"
import { getProfile } from "@/server/profile/repository"

/**
 * Profile repair: a background pass that fills what imports and quick edits leave behind.
 *
 * Each fixer is independent, idempotent and only fills empty fields — it never overwrites
 * something the user typed. Failed attempts are remembered so one stubborn entry isn't
 * retried on every tick. Add new fixers to FIXERS.
 */

const STATE_KEY = "profile.repair"
const RUN_EVERY_MS = 30 * 60_000
const RETRY_AFTER_MS = 7 * 24 * 3_600_000
const PER_RUN = 5
const LOGO_KINDS = new Set(["experience", "education", "project", "certification", "achievement"])

const state = z.object({
  lastRunAt: z.number().default(0),
  /** `${fixer}:${entryId}` → last failed attempt (ms). */
  tried: z.record(z.string(), z.number()).default({}),
})
type State = z.infer<typeof state>
type Entry = { id: string; kind: EntryKind; display: Record<string, EntryDisplay>; fields: EntryFields; logoPath: string | null }
type Outcome = "fixed" | "nothing"
type Fixer = { id: string; /** fixes per run */ budget?: number; needs: (entry: Entry) => boolean | Promise<boolean>; fix: (entry: Entry) => Promise<Outcome> }

/** Whose logo it is: company, school, issuer — or the project itself. */
const organizationOf = (entry: Entry) => { const view = entryView(entry, "en"); return entry.kind === "project" ? view.heading : view.subheading }

/* ---------- logos ---------- */

const UA = "Naruvi/0.1 (self-hosted job search assistant)"
const getJson = async (url: string) => {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(6000), cache: "no-store" })
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`)
  return response.json() as Promise<unknown>
}
const normalize = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

/** Official website from Wikidata, only for an exact name match (wrong logos are worse than none). */
async function websiteFromWikidata(name: string): Promise<string | null> {
  const search = (await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=5&language=en&search=${encodeURIComponent(name)}`)) as { search?: { id: string; label?: string }[] }
  const ids = (search.search ?? []).filter((hit) => normalize(hit.label ?? "") === normalize(name)).map((hit) => hit.id)
  if (!ids.length) return null
  const data = (await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${ids.join("|")}`)) as { entities?: Record<string, { claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> }> }
  for (const id of ids) {
    const site = data.entities?.[id]?.claims?.P856?.[0]?.mainsnak?.datavalue?.value
    if (typeof site === "string" && /^https?:\/\//.test(site)) return site
  }
  return null
}

const logoFixer: Fixer = {
  id: "logo",
  needs: (entry) => LOGO_KINDS.has(entry.kind) && !entry.logoPath && Boolean(organizationOf(entry)),
  async fix(entry) {
    const name = organizationOf(entry)
    // 1. A company Naruvi already knows (from a job or contact) under the same name.
    const [known] = await db.select({ logoPath: companies.logoPath, website: companies.website }).from(companies).where(eq(companies.slug, slugify(name))).limit(1)
    let logoPath = known?.logoPath ?? null
    // 2. Its website, or one found on Wikidata, then the logo on that site.
    if (!logoPath) {
      const website = known?.website ?? (await websiteFromWikidata(name).catch(() => null))
      if (website) logoPath = (await companyBrandingFromLink(website).catch(() => null))?.logo?.path ?? null
    }
    if (!logoPath) return "nothing"
    // Only if still empty: the user may have set one meanwhile.
    const updated = await db.update(entries).set({ logoPath }).where(and(eq(entries.id, entry.id), isNull(entries.logoPath))).returning({ id: entries.id })
    return updated.length ? "fixed" : "nothing"
  },
}

/* ---------- missing language versions ---------- */

// Entries are translated right after they are saved; this catches what that missed (no model yet, a failed call).
const translationFixer: Fixer = {
  id: "translate",
  // Cheap to check and usually quick: a whole freshly imported profile catches up in one or two runs.
  budget: 30,
  needs: (entry) => needsTranslation(entry.id),
  async fix(entry) {
    const { changed } = await translateSoon(entry.id)
    return changed ? "fixed" : "nothing"
  },
}

const FIXERS: Fixer[] = [logoFixer, translationFixer]

/* ---------- runner ---------- */

async function readState(): Promise<State> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, STATE_KEY) })
  const parsed = state.safeParse(row?.value ?? {})
  return parsed.success ? parsed.data : state.parse({})
}
const writeState = (value: State) => db.insert(settings).values({ key: STATE_KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } })

/** Called on the background timer. Cheap when nothing is due; at most PER_RUN fixes per run. */
export async function repairProfileIfDue({ force = false } = {}) {
  const current = await readState()
  const now = Date.now()
  if (!force && now - current.lastRunAt < RUN_EVERY_MS) return { fixed: 0, tried: 0 }
  const profile = await getProfile().catch(() => null)
  if (!profile) return { fixed: 0, tried: 0 }
  const rows = (await db
    .select({ id: entries.id, kind: entries.kind, display: entries.display, fields: entries.fields, logoPath: entries.logoPath })
    .from(entries)
    .where(and(eq(entries.profileId, profile.id), ne(entries.status, "archived")))) as Entry[]

  const tried = Object.fromEntries(Object.entries(current.tried).filter(([, at]) => now - at < RETRY_AFTER_MS))
  const live = new Set(rows.map((row) => row.id))
  for (const key of Object.keys(tried)) if (!live.has(key.split(":")[1])) delete tried[key]

  let fixed = 0
  let attempts = 0
  for (const fixer of FIXERS) {
    let budget = fixer.budget ?? PER_RUN
    for (const entry of rows) {
      if (budget <= 0) break
      const key = `${fixer.id}:${entry.id}`
      if (tried[key] || !(await fixer.needs(entry))) continue
      budget -= 1
      attempts += 1
      const outcome = await fixer.fix(entry).catch((error) => {
        console.error(`[naruvi] profile repair (${fixer.id}):`, error instanceof Error ? error.message : error)
        return "nothing" as const
      })
      if (outcome === "fixed") fixed += 1
      else tried[key] = now
    }
  }
  await writeState({ lastRunAt: now, tried })
  return { fixed, tried: attempts }
}
