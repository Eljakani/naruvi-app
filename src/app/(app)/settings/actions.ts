"use server"

import { revalidatePath } from "next/cache"
import { prepareFonts } from "@/server/documents/fonts"
import { saveDocumentDefaults, setDefaultLanguage, testLlm } from "@/server/settings/service"

type Result = { ok: true; message?: string } | { ok: false; message: string }

const fail = (error: unknown): Result => ({ ok: false, message: error instanceof Error ? error.message : String(error) })

export async function saveDocumentDefaultsAction(input: unknown): Promise<Result> {
  try {
    await saveDocumentDefaults(input)
    revalidatePath("/settings")
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function setDefaultLanguageAction(language: string): Promise<Result> {
  try {
    await setDefaultLanguage(language)
    revalidatePath("/settings")
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function testLlmAction(): Promise<Result> {
  return testLlm()
}

/** Pre-download the CJK fonts so documents in those scripts render offline. */
export async function downloadFontsAction(): Promise<Result> {
  try {
    const plan = await prepareFonts("sans", ["latin", "cjk-sc", "cjk-jp", "cjk-kr"])
    revalidatePath("/settings")
    return plan.missing.length ? { ok: false, message: `Could not download: ${plan.missing.join(", ")}. Check your connection.` } : { ok: true, message: "Chinese, Japanese and Korean fonts are ready." }
  } catch (error) {
    return fail(error)
  }
}
