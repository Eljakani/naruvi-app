import "server-only"
import { and, asc, eq, inArray } from "drizzle-orm"
import { planTranslations, type PlanEntry, type TranslationJob } from "@/lib/auto-translate"
import { db } from "@/server/db/client"
import { entries, phrasings, profiles } from "@/server/db/schema"
import { completionForRun } from "@/server/llm/client"
import { IMPORT_PROMPT_VERSION, translateEntry } from "@/server/profile/ai-import"
import { startRun } from "@/server/runs/tracer"
import { getLlmOverview } from "@/server/settings/llm"

/**
 * Keeps every profile entry written in each CV language, automatically.
 * Runs right after an entry is saved or imported (queueTranslation) and again
 * on the background timer for anything that failed or was saved without a
 * model configured. What the user wrote is never overwritten: see
 * src/lib/auto-translate.ts for the ownership rule.
 */

export const CV_LANGUAGES = ["en", "fr"] as const

type Loaded = PlanEntry & { id: string; profileId: string }

async function load(entryId: string, tx: Pick<typeof db, "select"> = db): Promise<Loaded | null> {
  const [entry] = await tx.select().from(entries).where(eq(entries.id, entryId))
  if (!entry || entry.status === "archived") return null
  const lines = await tx.select().from(phrasings).where(eq(phrasings.entryId, entryId)).orderBy(asc(phrasings.sortOrder))
  return { id: entry.id, profileId: entry.profileId, kind: entry.kind, display: entry.display, translations: entry.translations, phrasings: lines }
}

async function preferredLanguage(profileId: string) {
  const [profile] = await db.select({ language: profiles.defaultLanguage }).from(profiles).where(eq(profiles.id, profileId))
  return profile?.language ?? "en"
}

/** Whether an entry has anything left to translate (no model call). */
export async function needsTranslation(entryId: string) {
  const entry = await load(entryId)
  if (!entry) return false
  const plan = planTranslations(entry, CV_LANGUAGES, await preferredLanguage(entry.profileId))
  return plan.jobs.length > 0 || plan.clearFields.length > 0 || plan.deleteLines.length > 0
}

type Translated = { job: TranslationJob; text: Record<string, string>; lines: Map<number, string> }

/** Translate one entry now. Returns how many fields and lines changed. */
export async function translateEntryNow(entryId: string): Promise<{ changed: number }> {
  const entry = await load(entryId)
  if (!entry) return { changed: 0 }
  const preferred = await preferredLanguage(entry.profileId)
  const plan = planTranslations(entry, CV_LANGUAGES, preferred)
  const results: Translated[] = []
  if (plan.jobs.length) {
    if (!(await getLlmOverview().catch(() => null))?.configured) return { changed: 0 }
    for (const job of plan.jobs) {
      const run = await startRun("profile.translate", { entryId, from: job.from, to: job.to, fields: Object.keys(job.text).length, lines: job.lines.length })
      try {
        const reply = await translateEntry({ from: job.from, to: job.to, text: job.text, bullets: job.lines.map((line, index) => ({ id: String(index), text: line.source.text })) }, completionForRun(run, "translate entry", IMPORT_PROMPT_VERSION))
        await run.finish("succeeded", { fields: Object.keys(reply.text).length, lines: reply.bullets.length })
        results.push({ job, text: reply.text, lines: new Map(reply.bullets.map((line) => [Number(line.id), line.text])) })
      } catch (error) {
        await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
        throw error
      }
    }
  }

  // Apply against the entry as it is now: the user may have edited it while the model was answering.
  return db.transaction(async (tx) => {
    await tx.select({ id: entries.id }).from(entries).where(eq(entries.id, entryId)).for("update")
    const fresh = await load(entryId, tx)
    if (!fresh) return { changed: 0 }
    const now = planTranslations(fresh, CV_LANGUAGES, preferred)
    const display = structuredClone(fresh.display)
    const translations = structuredClone(fresh.translations)
    let changed = 0

    for (const { job, text, lines } of results) {
      const current = now.jobs.find((item) => item.from === job.from && item.to === job.to)
      if (!current) continue
      for (const [key, value] of Object.entries(text)) {
        // Still wanted, from the same source text.
        if (current.text[key] !== job.text[key]) continue
        display[job.to] = { ...display[job.to], [key]: value }
        translations[job.to] = { ...translations[job.to], [key]: { text: value, source: job.text[key] } }
        changed += 1
      }
      for (const [index, value] of lines) {
        const planned = job.lines[index]
        const still = current.lines.find((line) => line.source.text === planned.source.text && line.source.group === planned.source.group && line.source.role === planned.source.role)
        if (!still) continue
        const values = { text: value, autoText: value, autoSource: still.source.text, factIds: still.source.factIds }
        if (still.replaces) await tx.update(phrasings).set(values).where(and(eq(phrasings.id, still.replaces), eq(phrasings.entryId, entryId)))
        else await tx.insert(phrasings).values({ ...values, entryId, group: still.source.group, role: still.source.role, language: job.to, sortOrder: still.source.sortOrder })
        changed += 1
      }
    }
    for (const { lang, key } of now.clearFields) {
      display[lang] = { ...display[lang] }
      delete display[lang][key]
      translations[lang] = { ...translations[lang] }
      delete translations[lang][key]
      changed += 1
    }
    if (now.deleteLines.length) {
      await tx.delete(phrasings).where(and(eq(phrasings.entryId, entryId), inArray(phrasings.id, now.deleteLines)))
      changed += now.deleteLines.length
    }
    if (changed) await tx.update(entries).set({ display: Object.fromEntries(Object.entries(display).filter(([, values]) => Object.keys(values).length)), translations }).where(eq(entries.id, entryId))
    return { changed }
  })
}

/* ---------- queue: one entry at a time, in this process ---------- */

let chain: Promise<unknown> = Promise.resolve()
const pending = new Map<string, Promise<{ changed: number }>>()

/** Translate soon, in the background. Saving never waits for the model. */
export function queueTranslation(entryIds: string[]) {
  for (const id of entryIds) void translateSoon(id)
}

/** The queued translation of an entry (queued if it isn't), for a caller that wants to wait. */
export function translateSoon(entryId: string): Promise<{ changed: number }> {
  const existing = pending.get(entryId)
  if (existing) return existing
  const next = chain
    .then(() => translateEntryNow(entryId))
    .catch((error) => {
      console.error("[naruvi] auto-translate:", error instanceof Error ? error.message : error)
      return { changed: 0 }
    })
    .finally(() => pending.delete(entryId))
  pending.set(entryId, next)
  chain = next
  return next
}
