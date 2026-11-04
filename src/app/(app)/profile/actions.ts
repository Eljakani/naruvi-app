"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { safeFetchBytes } from "@/server/assets/safe-fetch"
import { MAX_IMAGE_BYTES, storeLogo, storePhoto } from "@/server/assets/store"
import { addFactForBullet, linkBulletFacts, setBulletRole } from "@/server/profile/repository"
import { deleteEntry, importProfileFolder, saveEntry, saveIdentity, setEntryStatus } from "@/server/profile/repository"
import type { EntryInput, IdentityInput } from "@/server/profile/schemas"

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
