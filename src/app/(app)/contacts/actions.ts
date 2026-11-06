"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { contactsFromRows } from "@/lib/contact-import"
import { parseCsv } from "@/lib/linkedin-export"
import { completeJson } from "@/server/llm/client"
import { readProfileText, type ProfileGuess } from "@/server/contacts/ai-profile"
import { analyzeJob } from "@/server/applications/repository"
import { deleteContact, findEmail, importContacts, linkContact, saveContact, saveEmailFinder, startSpontaneous, unlinkContact, type ContactInput } from "@/server/contacts/repository"

type Result<T = undefined> = { ok: true; data: T } | { ok: false; message: string }
const fail = (error: unknown): { ok: false; message: string } => ({ ok: false, message: error instanceof z.ZodError ? (error.issues[0]?.message ?? "Check the form.") : error instanceof Error ? error.message : String(error) })
const refresh = () => {
  revalidatePath("/contacts")
  revalidatePath("/companies")
}

export async function saveContactAction(input: ContactInput, id?: string): Promise<Result<{ id: string }>> {
  try {
    const saved = await saveContact(input, id && z.string().uuid().safeParse(id).success ? id : undefined)
    refresh()
    return { ok: true, data: { id: saved } }
  } catch (error) {
    return fail(error)
  }
}

export async function deleteContactAction(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Invalid contact." }
  await deleteContact(id)
  refresh()
  return { ok: true, data: undefined }
}

/** CSV or Excel (first sheet), including LinkedIn's Connections export. */
export async function importContactsAction(formData: FormData): Promise<Result<{ created: number; updated: number; skipped: number }>> {
  const file = formData.get("file")
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Choose a CSV or Excel file." }
  if (file.size > 10 * 1024 * 1024) return { ok: false, message: "That file is over 10 MB." }
  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    let rows: Record<string, string>[]
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const { readSheet } = await import("read-excel-file/node")
      const sheet = await readSheet(bytes)
      const [header, ...body] = sheet.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))))
      rows = body.map((cells) => Object.fromEntries((header ?? []).map((name, index) => [name, cells[index] ?? ""])))
    } else {
      rows = parseCsv(bytes.toString("utf8"))
    }
    const { contacts, skipped } = contactsFromRows(rows)
    if (!contacts.length) return { ok: false, message: "No contacts found. The file needs at least a name column (or first and last name)." }
    const result = await importContacts(contacts)
    refresh()
    return { ok: true, data: { ...result, skipped } }
  } catch (error) {
    return fail(error)
  }
}

export async function findEmailAction(id: string): Promise<Result<{ email: string; confidence: number }>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Invalid contact." }
  try {
    const result = await findEmail(id)
    refresh()
    return { ok: true, data: result }
  } catch (error) {
    return fail(error)
  }
}

export async function saveEmailFinderAction(apiKey: string): Promise<Result> {
  try {
    await saveEmailFinder(z.string().max(200).parse(apiKey))
    revalidatePath("/integrations")
    return { ok: true, data: undefined }
  } catch (error) {
    return fail(error)
  }
}

/** Start a spontaneous application at a company, linked to the person you'll write to. */
export async function startSpontaneousAction(input: { companyName: string; role?: string; contactId?: string; language?: string }): Promise<Result<{ applicationId: string }>> {
  try {
    const parsed = z.object({ companyName: z.string().trim().min(1, "Choose a company").max(160), role: z.string().trim().max(160).optional(), contactId: z.string().uuid().optional(), language: z.enum(["en", "fr", "de", "es"]).optional() }).parse(input)
    const { jobId } = await startSpontaneous(parsed)
    const application = await analyzeJob(jobId)
    if (parsed.contactId) await linkContact(application.id, parsed.contactId, "recipient")
    refresh()
    revalidatePath("/applications")
    return { ok: true, data: { applicationId: application.id } }
  } catch (error) {
    return fail(error)
  }
}

export async function linkContactAction(applicationId: string, contactId: string, role = ""): Promise<Result> {
  const ids = z.object({ applicationId: z.string().uuid(), contactId: z.string().uuid(), role: z.string().max(60) }).safeParse({ applicationId, contactId, role })
  if (!ids.success) return { ok: false, message: "Invalid request." }
  await linkContact(applicationId, contactId, role)
  revalidatePath(`/applications/${applicationId}`)
  refresh()
  return { ok: true, data: undefined }
}

export async function unlinkContactAction(applicationId: string, contactId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(applicationId).success || !z.string().uuid().safeParse(contactId).success) return { ok: false, message: "Invalid request." }
  await unlinkContact(applicationId, contactId)
  revalidatePath(`/applications/${applicationId}`)
  refresh()
  return { ok: true, data: undefined }
}

/** Name, role and company from text copied off a profile page; only values found in that text. */
export async function readProfileAction(text: string): Promise<Result<ProfileGuess>> {
  try {
    const input = z.string().trim().min(20, "Paste a bit more of the profile.").max(20000).parse(text)
    return { ok: true, data: await readProfileText(input, completeJson) }
  } catch (error) {
    return fail(error)
  }
}
