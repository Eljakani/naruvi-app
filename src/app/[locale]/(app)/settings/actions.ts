"use server"

import { revalidatePath } from "next/cache"
import { prepareFonts } from "@/server/documents/fonts"
import { saveDocumentPhotoDefault, setDefaultLanguage, testLlm } from "@/server/settings/service"
import { resolveDraftConnection, saveLlmSettings, type LlmOverview } from "@/server/settings/llm"
import { llmConnectionInput, llmSettingsInput } from "@/server/settings/llm-schema"
import { listProviderModels } from "@/server/settings/model-catalog"
import { SettingsError } from "@/server/settings/errors"
import { saveDecisionSettings, testDecisionModel, type DecisionOverview } from "@/server/settings/decisions"
import { saveSpeechSettings, testSpeech, type SpeechOverview } from "@/server/settings/speech"
import { serverError } from "@/i18n/server-errors"
import { saveAutomationSettings } from "@/server/settings/automation"

type Result = { ok: true; message?: string } | { ok: false; message: string }

const fail = (error: unknown): Result => ({ ok: false, message: error instanceof Error ? error.message : String(error) })

export async function saveDocumentPhotoDefaultAction(showPhoto: boolean): Promise<Result> {
  if (typeof showPhoto !== "boolean") return { ok: false, message: await serverError("chooseWhetherToShow") }
  try {
    await saveDocumentPhotoDefault(showPhoto)
    revalidatePath("/settings")
    revalidatePath("/integrations")
    revalidatePath("/templates")
    revalidatePath("/templates/[id]", "page")
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/** Turn the automatic fit check for newly added jobs on or off. */
export async function saveAutoFitCheckAction(enabled: boolean): Promise<Result> {
  if (typeof enabled !== "boolean") return { ok: false, message: await serverError("invalidInput") }
  try {
    await saveAutomationSettings({ autoFitCheck: enabled })
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
    revalidatePath("/integrations")
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
    if (!models.length) return { ok: false as const, message: await serverError("noModelsWereReturned") }
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
    revalidatePath("/integrations")
    revalidatePath("/")
    revalidatePath("/setup")
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
    revalidatePath("/integrations")
    return plan.missing.length ? { ok: false, message: await serverError("couldNotDownload", { files: plan.missing.join(", ") }) } : { ok: true, message: await serverError("cjkFontsReady") }
  } catch (error) {
    return fail(error)
  }
}

export async function saveDecisionSettingsAction(input: unknown): Promise<{ ok: true; overview: DecisionOverview } | { ok: false; message: string }> {
  try {
    const overview = await saveDecisionSettings(input)
    revalidatePath("/settings")
    revalidatePath("/integrations")
    return { ok: true, overview }
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false, message: error.message }
    if (error instanceof Error && error.name === "ZodError") return { ok: false, message: await serverError("checkTheModelId") }
    return { ok: false, message: await serverError("decisionSaveFailed") }
  }
}

export async function testDecisionModelAction(): Promise<Result> {
  return testDecisionModel()
}

export async function saveSpeechSettingsAction(input: unknown): Promise<{ ok: true; overview: SpeechOverview } | { ok: false; message: string }> {
  try {
    const overview = await saveSpeechSettings(input)
    revalidatePath("/integrations")
    return { ok: true, overview }
  } catch (error) {
    if (error instanceof SettingsError) return { ok: false, message: error.message }
    if (error instanceof Error && error.name === "ZodError") return { ok: false, message: await serverError("checkTheProviderModel") }
    return { ok: false, message: await serverError("speechSaveFailed") }
  }
}

export async function testSpeechAction(): Promise<Result> {
  return testSpeech()
}
