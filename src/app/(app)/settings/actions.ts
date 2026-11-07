"use server"

import { revalidatePath } from "next/cache"
import { prepareFonts } from "@/server/documents/fonts"
import { saveDocumentPhotoDefault, setDefaultLanguage, testLlm } from "@/server/settings/service"
import { resolveDraftConnection, saveLlmSettings, type LlmOverview } from "@/server/settings/llm"
import { llmConnectionInput, llmSettingsInput } from "@/server/settings/llm-schema"
import { listProviderModels } from "@/server/settings/model-catalog"
import { SettingsError } from "@/server/settings/errors"
import { saveDecisionSettings, testDecisionModel, type DecisionOverview } from "@/server/settings/decisions"

type Result = { ok: true; message?: string } | { ok: false; message: string }

const fail = (error: unknown): Result => ({ ok: false, message: error instanceof Error ? error.message : String(error) })

export async function saveDocumentPhotoDefaultAction(showPhoto: boolean): Promise<Result> {
  if (typeof showPhoto !== "boolean") return { ok: false, message: "Choose whether to show a photo." }
  try {
    await saveDocumentPhotoDefault(showPhoto)
    revalidatePath("/settings")
    revalidatePath("/templates")
    revalidatePath("/templates/[id]", "page")
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

export async function testLlmAction(input?: unknown): Promise<Result> {
  return testLlm(input)
}

export async function listLlmModelsAction(input: unknown) {
  const parsed = llmConnectionInput.safeParse(input)
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the provider settings." }
  try {
    const models = await listProviderModels(await resolveDraftConnection(parsed.data))
    if (!models.length) return { ok: false as const, message: "No models were returned. Load a model on your server or enter its ID manually." }
    return { ok: true as const, models }
  } catch (error) {
    return { ok: false as const, message: error instanceof SettingsError ? error.message : "Could not load models. Check the connection or enter a model ID manually." }
  }
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

export async function saveDecisionSettingsAction(input: unknown): Promise<{ ok: true; overview: DecisionOverview } | { ok: false; message: string }> {
  try {
    const overview = await saveDecisionSettings(input)
    revalidatePath("/settings")
    return { ok: true, overview }
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false, message: error.message }
    if (error instanceof Error && error.name === "ZodError") return { ok: false, message: "Check the model id and key." }
    return { ok: false, message: "Could not save the decision model settings." }
  }
}

export async function testDecisionModelAction(): Promise<Result> {
  return testDecisionModel()
}
