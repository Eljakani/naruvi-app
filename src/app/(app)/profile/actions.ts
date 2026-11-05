"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { safeFetchBytes } from "@/server/assets/safe-fetch"
import { MAX_IMAGE_BYTES, storeLogo, storePhoto } from "@/server/assets/store"
import { addFactForBullet, linkBulletFacts, setBulletRole } from "@/server/profile/repository"
import { deleteEntry, importProfileFolder, saveEntry, saveIdentity, setEntryStatus } from "@/server/profile/repository"
import type { EntryInput, IdentityInput } from "@/server/profile/schemas"
import { BULLETS_PROMPT_VERSION, suggestBullets, type BulletSuggestion } from "@/server/profile/ai-bullets"
import { completionForRun } from "@/server/llm/client"
import { startRun } from "@/server/runs/tracer"
import { getLlmOverview } from "@/server/settings/llm"
import { describeEntry, importProfileText, IMPORT_PROMPT_VERSION, translateEntry } from "@/server/profile/ai-import"
import { pdfText } from "@/server/profile/pdf-text"
import { saveImportedProfile } from "@/server/profile/repository"
import { decisionClient } from "@/server/settings/decisions"
import { SUPPORT_THRESHOLD, verifyClaims } from "@/server/decisions/verify"
import { tracedDecide } from "@/server/runs/decisions"

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

export async function setEntryStatusAction(entryId: string, status: "verified" | "needs_review" | "archived") {
  return run(() => setEntryStatus(z.string().uuid().parse(entryId), status))
}

export async function deleteEntryAction(entryId: string) {
  return run(() => deleteEntry(z.string().uuid().parse(entryId)))
}

export async function saveIdentityAction(input: IdentityInput) {
  return run(async () => {
    await saveIdentity(input)
  })
}

export async function importProfileAction(folder: string) {
  return run(() => importProfileFolder(z.string().trim().min(1, "Enter a folder path.").parse(folder)))
}

/** Upload a logo file. Returns the stored path; the entry is updated on Save. */
export async function uploadLogoAction(formData: FormData) {
  return run(async () => {
    const file = formData.get("file")
    if (!(file instanceof File)) throw new Error("Choose an image file.")
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Logos must be 2 MB or smaller.")
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
    if (!(file instanceof File)) throw new Error("Choose an image file.")
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Photos must be 2 MB or smaller.")
    return storePhoto(Buffer.from(await file.arrayBuffer()))
  })
}

const uuid = z.string().uuid()

export async function linkBulletFactsAction(phrasingId: string, factIds: string[]) {
  return run(() => linkBulletFacts(uuid.parse(phrasingId), z.array(uuid).parse(factIds)))
}

export async function addFactForBulletAction(phrasingId: string, statement: string, alsoLink: string[] = []) {
  return run(() => addFactForBullet(uuid.parse(phrasingId), z.string().max(600).parse(statement), z.array(uuid).parse(alsoLink)))
}

export async function setBulletRoleAction(phrasingId: string, role: "bullet" | "label") {
  return run(() => setBulletRole(uuid.parse(phrasingId), z.enum(["bullet", "label"]).parse(role)))
}

const suggestInput = z.object({
  kind: z.string().max(40),
  role: z.string().max(200),
  organization: z.string().max(200),
  facts: z.array(z.object({ key: z.string().max(64), statement: z.string().max(600) })).max(60),
  existing: z.array(z.string().max(600)).max(80),
  languages: z.array(z.string().regex(/^[a-z]{2}$/)).min(1).max(4),
})

/** AI bullet drafts from the entry's facts. Nothing is saved: the user picks what to add. */
export async function suggestBulletsAction(input: unknown): Promise<{ ok: true; bullets: BulletSuggestion[]; model: string } | { ok: false; message: string }> {
  const parsed = suggestInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: "Invalid entry." }
  if (!(await getLlmOverview().catch(() => null))?.configured) return { ok: false, message: "No language model configured. Add one in Settings." }
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
  if (!(await getLlmOverview().catch(() => null))?.configured) return { ok: false, message: "No language model configured. Add one in Settings." }
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

/** Reads a CV (PDF upload or pasted text) into proposed entries. Saves nothing. */
export async function readCvAction(formData: FormData) {
  const file = formData.get("file")
  const pasted = String(formData.get("text") ?? "").trim()
  let text = pasted
  if (file instanceof File && file.size) {
    if (file.size > 8 * 1024 * 1024) return { ok: false as const, message: "That file is over 8 MB." }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") text = await pdfText(bytes).catch(() => "")
    else text = new TextDecoder().decode(bytes)
    if (text.trim().length < 80) return { ok: false as const, message: "Couldn’t read text from that file. If it’s a scanned PDF, paste the text instead." }
  }
  if (text.length < 80) return { ok: false as const, message: "Paste your CV or upload a PDF first." }
  return withModel("profile.import", "profile import", IMPORT_PROMPT_VERSION, (complete, run) =>
    run.step("structure CV", () => importProfileText(text, complete), (value) => `${value.entries.length} entries · ${value.entries.reduce((sum, item) => sum + item.facts.length, 0)} facts · ${value.entries.reduce((sum, item) => sum + item.dropped, 0)} unsupported items dropped`),
  )
}

const importedEntry = z.object({
  kind: z.enum(["experience", "education", "project", "skill", "certification", "language", "achievement", "other"]),
  title: z.string().trim().min(1).max(200),
  display: z.object({ role: z.string().max(200), organization: z.string().max(200), dates: z.string().max(80), location: z.string().max(120) }),
  facts: z.array(z.string().trim().min(3).max(600)).max(30),
  skills: z.array(z.string().max(60)).max(40),
  bullets: z.array(z.object({ text: z.string().min(3).max(600), facts: z.array(z.number().int().nonnegative()) })).max(20),
})
const importPayload = z.object({
  language: z.string().regex(/^[a-z]{2}$/),
  identity: z.object({ fullName: z.string().max(120), headline: z.string().max(160), email: z.string().max(200), phone: z.string().max(40), location: z.string().max(120), links: z.array(z.object({ label: z.string().max(40), url: z.string().max(500) })).max(10) }),
  entries: z.array(importedEntry).max(60),
})

export async function saveImportAction(input: unknown) {
  const parsed = importPayload.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: "Some imported entries are invalid." }
  const result = await saveImportedProfile(parsed.data)
  revalidatePath("/profile")
  revalidatePath("/")
  return { ok: true as const, data: result }
}

export async function describeEntryAction(input: { words: string; kind?: string; existingFacts: string[] }) {
  const parsed = z.object({ words: z.string().trim().min(20, "Write a few sentences first.").max(12_000), kind: z.string().max(40).optional(), existingFacts: z.array(z.string().max(600)).max(80) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Invalid input." }
  return withModel("profile.describe", "entry from description", IMPORT_PROMPT_VERSION, (complete, run) =>
    run.step("structure description", () => describeEntry(parsed.data.words, parsed.data, complete), (value) => `${value.entry.facts.length} facts · ${value.entry.skills.length} skills`),
  )
}

export async function translateEntryAction(input: { from: string; to: string; display: { role: string; organization: string; dates: string; location: string }; bullets: { id: string; text: string }[] }) {
  const lang = z.string().regex(/^[a-z]{2}$/)
  const parsed = z.object({ from: lang, to: lang, display: z.object({ role: z.string().max(200), organization: z.string().max(200), dates: z.string().max(80), location: z.string().max(120) }), bullets: z.array(z.object({ id: z.string().max(64), text: z.string().max(600) })).max(40) }).safeParse(input)
  if (!parsed.success) return { ok: false as const, message: "Invalid input." }
  return withModel("profile.translate", "entry translation", IMPORT_PROMPT_VERSION, (complete, run) =>
    run.step(`translate ${parsed.data.from} → ${parsed.data.to}`, () => translateEntry(parsed.data, complete), (value) => `${value.bullets.length}/${parsed.data.bullets.length} bullets kept`),
  )
}
