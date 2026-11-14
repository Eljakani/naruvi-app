"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { saveSetupChoices } from "@/server/queries/setup"
import { connectDecisionModel } from "@/server/settings/decisions"

/** Leave the guide for later: the dashboard opens from now on, and the guide stays in Settings. */
export async function skipSetupAction() {
  await saveSetupChoices({ skipped: true })
  revalidatePath("/")
  redirect("/")
}

/** Hide the decision-model suggestion; it stays available in Integrations. */
export async function dismissDecisionTipAction() {
  await saveSetupChoices({ decisionDismissed: true })
  revalidatePath("/setup")
}

/** Check a decision-model key with one question and save it only if the model answers. */
export async function connectDecisionModelAction(input: unknown) {
  try {
    const result = await connectDecisionModel(input)
    if (result.ok) {
      revalidatePath("/setup")
      revalidatePath("/integrations")
    }
    return result
  } catch {
    return { ok: false as const, reason: "other" as const, message: "" }
  }
}
