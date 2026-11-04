"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { generateCv, generateLetter, saveCvEdit, setCurrentRevision } from "@/server/documents/service"

const uuid = z.string().uuid()
const lang = z.string().regex(/^[a-z]{2}$/)

export async function generateCvAction(formData: FormData) {
  const applicationId = uuid.parse(formData.get("applicationId"))
  const language = lang.parse(formData.get("language"))
  await generateCv(applicationId, language)
  revalidatePath(`/applications/${applicationId}`, "layout")
  redirect(`/applications/${applicationId}/cv?lang=${language}`)
}

export async function saveCvEditAction(applicationId: string, documentId: string, content: unknown) {
  try {
    const result = await saveCvEdit(uuid.parse(documentId), content)
    revalidatePath(`/applications/${uuid.parse(applicationId)}`, "layout")
    return { ok: true as const, data: { revisionId: result.revisionId, score: result.quality.score, pages: result.quality.pages, ready: result.quality.ready } }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function setCurrentRevisionAction(applicationId: string, documentId: string, revisionId: string) {
  try {
    await setCurrentRevision(uuid.parse(documentId), uuid.parse(revisionId))
    revalidatePath(`/applications/${uuid.parse(applicationId)}`, "layout")
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function generateLetterAction(formData: FormData) {
  const applicationId = uuid.parse(formData.get("applicationId"))
  const language = lang.parse(formData.get("language"))
  await generateLetter(applicationId, language)
  revalidatePath(`/applications/${applicationId}`, "layout")
  redirect(`/applications/${applicationId}/letter?lang=${language}`)
}
