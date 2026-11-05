"use server"

import { revalidatePath } from "next/cache"
import { prepareFonts } from "@/server/documents/fonts"
import { saveDocumentDefaults, setDefaultLanguage, testLlm } from "@/server/settings/service"
import { saveLlmSettings, type LlmOverview } from "@/server/settings/llm"
import { llmSettingsInput } from "@/server/settings/llm-schema"
import { SettingsError } from "@/server/settings/errors"

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

export async function saveLlmSettingsAction(input: unknown): Promise<{ ok: true; overview: LlmOverview } | { ok: false; message: string }> {
  const parsed = llmSettingsInput.safeParse(input)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the model settings." }
  try {
    const overview = await saveLlmSettings(parsed.data)
    revalidatePath("/settings")
    revalidatePath("/")
    return { ok: true, overview }
  } catch (error) {
    return { ok: false, message: error instanceof SettingsError ? error.message : "Could not save model settings. Try again." }
  }
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
