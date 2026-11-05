import "server-only"
import { existsSync, statSync } from "node:fs"
import { join } from "node:path"
import { count, sql } from "drizzle-orm"
import { z } from "zod"
import { env, llmConfigured } from "@/lib/env"
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
  let llmHost = ""
  try {
    llmHost = new URL(env.LLM_BASE_URL).host
  } catch {
    llmHost = env.LLM_BASE_URL
  }
  return {
    counts: { profiles: p.n, entries: e.n, facts: f.n, phrasings: ph.n, jobs: j.n, applications: a.n, revisions: r.n },
    database: `PostgreSQL ${version[0]?.v ?? "?"}`,
    assetsDir: ASSETS_DIR,
    defaultLanguage: profile?.defaultLanguage ?? "en",
    llm: { configured: llmConfigured, host: llmHost, model: env.LLM_MODEL, hasKey: env.LLM_API_KEY.length > 0 },
    fonts,
    appVersion: process.env.npm_package_version ?? "0.1.0",
  }
}

/** Cheapest possible round trip to check the model endpoint and key. */
export async function testLlm() {
  if (!llmConfigured) return { ok: false, message: "No model configured. Set LLM_API_KEY (and LLM_BASE_URL / LLM_MODEL) in .env.local, then restart." }
  const started = Date.now()
  try {
    const response = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(env.LLM_API_KEY ? { authorization: `Bearer ${env.LLM_API_KEY}` } : {}) },
      body: JSON.stringify({ model: env.LLM_MODEL, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) return { ok: false, message: `The endpoint answered ${response.status}: ${(await response.text()).slice(0, 160)}` }
    return { ok: true, message: `Connected to ${env.LLM_MODEL} in ${Date.now() - started} ms.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
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
    format: "careerbuddy-export",
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
    settings: settingRows,
  }
}
