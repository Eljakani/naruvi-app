import "server-only"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { count, sql } from "drizzle-orm"
import { z } from "zod"
import { getLlmConfiguration, getLlmOverview } from "./llm"
import { SettingsError } from "./errors"
import { exportableSettings } from "./llm-schema"
import { requestCompletion } from "@/server/llm/transport"
import { ASSETS_DIR } from "@/server/assets/store"
import { db } from "@/server/db/client"
import { applications, entries, facts, jobs, phrasings, profiles, revisions, settings } from "@/server/db/schema"

/** Document defaults applied when a CV or letter is first generated. */
export const documentDefaults = z.object({
  template: z.enum(["classic", "modern", "serif"]).default("classic"),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).default("#2563eb"),
  showPhoto: z.boolean().default(false),
})
export type DocumentDefaults = z.infer<typeof documentDefaults>

export async function getDocumentDefaults(): Promise<DocumentDefaults> {
  const row = await db.query.settings.findFirst({ where: (t, { eq }) => eq(t.key, "documents") })
  return documentDefaults.parse(row?.value ?? {})
}

export async function saveDocumentDefaults(input: unknown) {
  const value = documentDefaults.parse(input)
  await db.insert(settings).values({ key: "documents", value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  return value
}

export async function setDefaultLanguage(language: string) {
  const code = z.string().regex(/^[a-z]{2}$/).parse(language)
  await db.update(profiles).set({ defaultLanguage: code })
}

const CJK = ["SC", "JP", "KR"] as const

export async function getSystemOverview() {
  const [[p], [e], [f], [ph], [j], [a], [r]] = await Promise.all([
    db.select({ n: count() }).from(profiles),
    db.select({ n: count() }).from(entries),
    db.select({ n: count() }).from(facts),
    db.select({ n: count() }).from(phrasings),
    db.select({ n: count() }).from(jobs),
    db.select({ n: count() }).from(applications),
    db.select({ n: count() }).from(revisions),
  ])
  const version = await db.execute<{ v: string }>(sql`select current_setting('server_version') as v`)
  const profile = await db.query.profiles.findFirst()
  const fonts = CJK.map((code) => {
    const path = join(ASSETS_DIR, "fonts", `NotoSans${code}-Regular.otf`)
    return { code, downloaded: existsSync(path), bytes: existsSync(path) ? statSync(path).size : 0 }
  })
  const llm = await getLlmOverview()
  return {
    counts: { profiles: p.n, entries: e.n, facts: f.n, phrasings: ph.n, jobs: j.n, applications: a.n, revisions: r.n },
    database: `PostgreSQL ${version[0]?.v ?? "?"}`,
    assetsDir: ASSETS_DIR,
    defaultLanguage: profile?.defaultLanguage ?? "en",
    llm,
    fonts,
    appVersion: process.env.npm_package_version ?? "0.1.0",
  }
}

/** Cheapest possible round trip to check the model endpoint and key. */
export async function testLlm() {
  const started = Date.now()
  try {
    const config = await getLlmConfiguration()
    await requestCompletion(config, { system: "Reply briefly.", user: "ping", maxTokens: 1 }, { timeoutMs: 20_000, jsonMode: false })
    return { ok: true, message: `Connected to ${config.model} in ${Date.now() - started} ms.` }
  } catch (error) {
    return { ok: false, message: error instanceof SettingsError ? error.message : "Could not test the model connection. Check Settings and try again." }
  }
}

/** Everything the user owns, as one JSON document (no secrets, no binaries). */
export async function exportAll() {
  const [profileRows, entryRows, factRows, phrasingRows, companyRows, jobRows, applicationRows, documentRows, revisionRows, settingRows] = await Promise.all([
    db.query.profiles.findMany(),
    db.query.entries.findMany(),
    db.query.facts.findMany(),
    db.query.phrasings.findMany(),
    db.query.companies.findMany(),
    db.query.jobs.findMany(),
    db.query.applications.findMany(),
    db.query.documents.findMany(),
    db.query.revisions.findMany(),
    db.query.settings.findMany(),
  ])
  return {
    format: "naruvi-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: "Images (logos, photos) live in the asset store and are referenced by path.",
    profiles: profileRows,
    entries: entryRows,
    facts: factRows,
    phrasings: phrasingRows,
    companies: companyRows,
    jobs: jobRows,
    applications: applicationRows,
    documents: documentRows,
    revisions: revisionRows,
    settings: exportableSettings(settingRows),
  }
}
