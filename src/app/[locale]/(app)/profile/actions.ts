"use server"

import { looseFields, type EntryFields } from "@/lib/entry-fields"
import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { refreshRoleGroups } from "@/server/contacts/role-groups"
import { z } from "zod"
import { safeFetchBytes } from "@/server/assets/safe-fetch"
import { MAX_IMAGE_BYTES, storeLogo, storePhoto } from "@/server/assets/store"
import { deleteEntry, getEntry, saveEntry, saveGoals, saveIdentity, setEntryStatus } from "@/server/profile/repository"
import { translateSoon } from "@/server/profile/auto-translate"
import type { EntryInput, IdentityInput } from "@/server/profile/schemas"
import { BULLETS_PROMPT_VERSION, suggestBullets, type BulletSuggestion } from "@/server/profile/ai-bullets"
import { completionForRun } from "@/server/llm/client"
import { startRun } from "@/server/runs/tracer"
import { getLlmOverview } from "@/server/settings/llm"
import { describeEntry, importProfileText, IMPORT_PROMPT_VERSION, suggestEntryExtras, translateEntry } from "@/server/profile/ai-import"
import { linkedinImport } from "@/lib/linkedin-export"
import { pdfText } from "@/server/profile/pdf-text"
import { entriesForMatching, mergeIntoEntry, saveImportedProfile } from "@/server/profile/repository"
import { matchEntry } from "@/server/profile/import-match"
import { decisionClient } from "@/server/settings/decisions"
import { SUPPORT_THRESHOLD, verifyClaims } from "@/server/decisions/verify"
import { tracedDecide } from "@/server/runs/decisions"
import { serverError } from "@/i18n/server-errors"

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string }

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    revalidatePath("/profile", "layout")
    revalidatePath("/")
    return { ok: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function saveEntryAction(input: EntryInput, entryId?: string) {
  return run(async () => (await saveEntry(input, entryId)).id)
}

/** Waits for the entry's automatic translation (queued when it was saved) and returns the entry if it changed. */
export async function entryTranslationAction(entryId: string) {
  return run(async () => {
    const id = z.string().uuid().parse(entryId)
    const { changed } = await translateSoon(id)
    if (changed) revalidatePath("/profile")
    return changed ? await getEntry(id) : null
  })
}

export async function setEntryStatusAction(entryId: string, status: "verified" | "needs_review" | "archived") {
  return run(() => setEntryStatus(z.string().uuid().parse(entryId), status))
}

export async function deleteEntryAction(entryId: string) {
  return run(() => deleteEntry(z.string().uuid().parse(entryId)))
}

export async function saveIdentityAction(input: IdentityInput) {
  return run(async () => {
    await saveIdentity(input)
    revalidatePath("/", "layout")
  })
}

/** Search goals change every goal check, so the applications and jobs re-render too. */
export async function saveGoalsAction(goals: unknown) {
  return run(async () => {
    await saveGoals(goals)
    revalidatePath("/applications", "layout")
    revalidatePath("/jobs", "layout")
    // New roles mean new people to reach: regenerate the Find people groups after the response.
    after(() => refreshRoleGroups().catch((error) => console.error("[naruvi] role groups:", error instanceof Error ? error.message : error)))
  })
}

/** Upload a logo file. Returns the stored path; the entry is updated on Save. */
export async function uploadLogoAction(formData: FormData) {
  return run(async () => {
    const file = formData.get("file")
    if (!(file instanceof File)) throw new Error(await serverError("chooseAnImageFile"))
    if (file.size > MAX_IMAGE_BYTES) throw new Error(await serverError("logosMustBeMb"))
    return storeLogo(Buffer.from(await file.arrayBuffer()))
  })
}

/** Download a logo from a public image URL. */
export async function logoFromUrlAction(url: string) {
  return run(async () => {
    const parsed = z.string().trim().url("Enter a full image URL (https://…).").parse(url)
    return storeLogo(await safeFetchBytes(parsed, MAX_IMAGE_BYTES))
  })
}

export async function uploadPhotoAction(formData: FormData) {
  return run(async () => {
    const file = formData.get("file")
    if (!(file instanceof File)) throw new Error(await serverError("chooseAnImageFile"))
    if (file.size > MAX_IMAGE_BYTES) throw new Error(await serverError("photosMustBeMb"))
    return storePhoto(Buffer.from(await file.arrayBuffer()))
  })
}


const suggestInput = z.object({
  kind: z.string().max(40),
  /** The entry described from its own fields (src/lib/entry-fields describeEntry). */
  entry: z.string().max(400),
  facts: z.array(z.object({ key: z.string().max(64), statement: z.string().max(600) })).max(60),
  existing: z.array(z.string().max(600)).max(80),
  languages: z.array(z.string().regex(/^[a-z]{2}$/)).min(1).max(4),
})

/** AI bullet drafts from the entry's facts. Nothing is saved: the user picks what to add. */
export async function suggestBulletsAction(input: unknown): Promise<{ ok: true; bullets: BulletSuggestion[]; model: string } | { ok: false; message: string }> {
  const parsed = suggestInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: await serverError("invalidEntry") }
  if (!(await getLlmOverview().catch(() => null))?.configured) return { ok: false, message: await serverError("noLanguageModelConfigured") }
  const run = await startRun("profile.bullets", { facts: parsed.data.facts.length })
  try {
    const result = await run.step("AI suggest bullets", () => suggestBullets(parsed.data, completionForRun(run, "bullet suggestions", BULLETS_PROMPT_VERSION)), (value) => `${value.bullets.length} grounded suggestion(s)`)
    const decisions = await decisionClient().catch(() => null)
    if (decisions && result.bullets.length) {
      const facts = new Map(parsed.data.facts.map((fact) => [fact.key, fact.statement]))
      const scores = await run
        .step("verify suggestions (decision model)", () => verifyClaims(result.bullets.map((bullet, index) => ({ id: String(index), text: bullet.text, evidence: bullet.factKeys.map((key) => facts.get(key) ?? "") })), tracedDecide(run, decisions.decide, decisions.model)), (value) => `${[...value.values()].filter((p) => p < SUPPORT_THRESHOLD).length} rejected`)
        .catch(() => null)
      if (scores) result.bullets = result.bullets.filter((_, index) => (scores.get(String(index)) ?? 1) >= SUPPORT_THRESHOLD)
    }
    await run.finish("succeeded", { suggestions: result.bullets.length })
    return { ok: true, ...result }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    return { ok: false, message: error instanceof Error ? error.message : "AI suggestion failed." }
  }
}

/* ------------------------------------------------------------------ */
/* AI-assisted filling                                                 */
/* ------------------------------------------------------------------ */

async function withModel<T>(workflow: string, task: string, version: string, fn: (complete: ReturnType<typeof completionForRun>, run: Awaited<ReturnType<typeof startRun>>) => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  if (!(await getLlmOverview().catch(() => null))?.configured) return { ok: false, message: await serverError("noLanguageModelConfigured") }
  const run = await startRun(workflow, {})
  try {
    const data = await fn(completionForRun(run, task, version), run)
    await run.finish("succeeded")
    return { ok: true, data }
  } catch (error) {
    await run.finish("failed", undefined, error instanceof Error ? error.message : String(error))
    return { ok: false, message: error instanceof Error ? error.message : "The AI step failed." }
  }
}

async function readLinkedinExport(bytes: Uint8Array, csvName: string | null) {
  const { unzipSync, strFromU8 } = await import("fflate")
  let files: Record<string, string> = {}
  try {
    files = csvName ? { [csvName]: strFromU8(bytes) } : Object.fromEntries(Object.entries(unzipSync(bytes, { filter: (file) => /\.csv$/i.test(file.name) && file.originalSize < 5_000_000 })).map(([name, data]) => [name, strFromU8(data)]))
  } catch {
    return { ok: false as const, message: await serverError("couldntOpenThatZip") }
  }
  const result = linkedinImport(files)
  if (!result.found) return { ok: false as const, message: await serverError("noLinkedinProfileData") }
  const existing = await entriesForMatching()
  const entries = result.entries.map((entry) => ({ ...entry, match: matchEntry(entry, existing) }))
  return { ok: true as const, data: { language: result.language, identity: result.identity, entries, model: "LinkedIn export (read directly, no AI)" } }
}

/** Reads a CV (PDF upload or pasted text) or a LinkedIn data export into proposed entries. Saves nothing. */
export async function readCvAction(formData: FormData) {
  try {
    return await readCv(formData)
  } catch (error) {
    console.error("[naruvi] read CV:", error)
    return { ok: false as const, message: error instanceof Error ? error.message : await serverError("couldntReadTextFrom") }
  }
}

async function readCv(formData: FormData) {
  const file = formData.get("file")
  const pasted = String(formData.get("text") ?? "").trim()
  let text = pasted
  if (file instanceof File && file.size) {
    if (file.size > 8 * 1024 * 1024) return { ok: false as const, message: await serverError("fileOver8") }
    const bytes = new Uint8Array(await file.arrayBuffer())
    // LinkedIn's data export (ZIP of CSVs, or one CSV): structured, so read exactly, without AI.
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
    if (isZip || /\.csv$/i.test(file.name)) return readLinkedinExport(bytes, isZip ? null : file.name)
    if (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") text = await pdfText(bytes).catch(() => "")
    else text = new TextDecoder().decode(bytes)
    if (text.trim().length < 80) return { ok: false as const, message: await serverError("couldntReadTextFrom") }
  }
  if (text.length < 80) return { ok: false as const, message: await serverError("pasteYourCvOr") }
  const existing = await entriesForMatching()
  return withModel("profile.import", "profile import", IMPORT_PROMPT_VERSION, async (complete, run) => {
    const result = await run.step("structure CV", () => importProfileText(text, complete), (value) => `${value.entries.length} entries · ${value.entries.reduce((sum, item) => sum + item.facts.length, 0)} facts · ${value.entries.reduce((sum, item) => sum + item.dropped, 0)} unsupported items dropped`)
    const entries = result.entries.map((entry) => ({ ...entry, match: matchEntry(entry, existing) }))
    await run.step("match existing entries", async () => entries.filter((entry) => entry.match).length, (value) => `${value} of ${entries.length} already in your profile`)
    return { ...result, entries }
  })
}

const importedEntry = z.object({
  kind: z.enum(["experience", "education", "project", "skill", "certification", "language", "achievement", "other"]),
  text: z.record(z.string().max(40), z.string().max(200)),
  fields: z.record(z.string().max(40), z.unknown()),
  facts: z.array(z.string().trim().min(3).max(600)).max(40),
  skills: z.array(z.string().max(60)).max(80),
  bullets: z.array(z.object({ text: z.string().min(3).max(600), facts: z.array(z.number().int().nonnegative()) })).max(30),
})
const importPayload = z.object({
  language: z.string().regex(/^[a-z]{2}$/),
  merges: z.array(z.object({ entryId: z.string().uuid(), facts: z.array(z.string().trim().min(3).max(600)).max(40), skills: z.array(z.string().max(60)).max(80), text: z.record(z.string().max(40), z.string().max(200)), fields: z.record(z.string().max(40), z.unknown()) })).max(80).default([]),
  identity: z.object({ fullName: z.string().max(120), headline: z.string().max(160), email: z.string().max(200), phone: z.string().max(40), location: z.string().max(120), links: z.array(z.object({ label: z.string().max(40), url: z.string().max(500) })).max(10) }),
  entries: z.array(importedEntry).max(80),
}).transform((data) => ({ ...data, entries: data.entries.map((entry) => ({ ...entry, fields: looseFields(entry.kind, entry.fields) })) }))

/**
 * Saves the reviewed import. Never throws: one entry that can't be saved is
 * reported and the rest are kept (a thrown server action shows the error page).
 */
export async function saveImportAction(input: unknown) {
  const parsed = importPayload.safeParse(input)
  if (!parsed.success) {
    console.error("[naruvi] import payload:", parsed.error.issues.slice(0, 5))
    return { ok: false as const, message: await serverError("someImportedEntriesAre") }
  }
  try {
    const result = await saveImportedProfile(parsed.data, { dedupe: false, status: "verified" })
    let merged = 0
    let factsAdded = 0
    let reverify = 0
    const failed = [...result.failed]
    for (const merge of parsed.data.merges) {
      try {
        const outcome = await mergeIntoEntry(merge.entryId, { facts: merge.facts, skills: merge.skills, display: { language: parsed.data.language, text: merge.text, fields: merge.fields as EntryFields } }, { approvedByUser: true })
        merged += 1
        factsAdded += outcome.added
        if (outcome.reverified) reverify += 1
      } catch (error) {
        failed.push({ name: merge.entryId, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    revalidatePath("/profile")
    revalidatePath("/", "layout")
    return { ok: true as const, data: { ...result, failed: failed.length, merged, factsAdded, reverify } }
  } catch (error) {
    console.error("[naruvi] import save:", error)
    return { ok: false as const, message: error instanceof Error ? error.message : await serverError("someImportedEntriesAre") }
  }
}

export async function describeEntryAction(input: { words: string; kind?: string; existingFacts: string[] }) {
  const parsed = z.object({ words: z.string().trim().min(20, "Write a few sentences first.").max(12_000), kind: z.string().max(40).optional(), existingFacts: z.array(z.string().max(600)).max(80) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Invalid input." }
  return withModel("profile.describe", "entry from description", IMPORT_PROMPT_VERSION, (complete, run) =>
    run.step("structure description", () => describeEntry(parsed.data.words, parsed.data, complete), (value) => `${value.entry.facts.length} facts · ${value.entry.skills.length} skills`),
  )
}

export async function translateEntryAction(input: { from: string; to: string; text: Record<string, string>; bullets: { id: string; text: string }[] }) {
  const lang = z.string().regex(/^[a-z]{2}$/)
  const parsed = z.object({ from: lang, to: lang, text: z.record(z.string().max(40), z.string().max(200)), bullets: z.array(z.object({ id: z.string().max(64), text: z.string().max(600) })).max(40) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, message: await serverError("invalidInput") }
  return withModel("profile.translate", "entry translation", IMPORT_PROMPT_VERSION, (complete, run) =>
    run.step(`translate ${parsed.data.from} → ${parsed.data.to}`, () => translateEntry(parsed.data, complete), (value) => `${value.bullets.length}/${parsed.data.bullets.length} bullets kept`),
  )
}

/** Skills (named in the facts), matching keywords and "never say" rules for one entry. Nothing is saved. */
export async function suggestEntryExtrasAction(input: unknown) {
  const list = (max: number, len: number) => z.array(z.string().max(len)).max(max)
  const parsed = z.object({ kind: z.string().max(40), entry: z.string().max(400), facts: list(60, 600).min(1, "Add a fact first."), skills: list(80, 60), keywords: list(80, 60), rules: list(40, 300), confidential: z.boolean() }).safeParse(input)
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Invalid input." }
  return withModel("profile.extras", "entry skills and rules", IMPORT_PROMPT_VERSION, (complete, run) =>
    run.step("suggest skills, keywords and rules", () => suggestEntryExtras(parsed.data, complete), (value) => `${value.skills.length} skills · ${value.keywords.length} keywords · ${value.rules.length} rules`),
  )
}
