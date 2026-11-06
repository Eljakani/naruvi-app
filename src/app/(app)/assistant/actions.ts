"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { canonicalJobUrl } from "@/lib/job-alerts"
import { proposalSchema, type Proposal } from "@/lib/assistant"
import { runAssistant, type AssistantReply } from "@/server/assistant/agent"
import { saveContact } from "@/server/contacts/repository"
import { apiUpdateApplication } from "@/server/integrations/api-data"
import { saveCapture } from "@/server/jobs/leads"

type Result<T> = { ok: true; data: T } | { ok: false; message: string }
const message = (error: unknown) => (error instanceof z.ZodError ? (error.issues[0]?.message ?? "Check the details.") : error instanceof Error ? error.message : String(error))

const history = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(40)

export async function askAssistantAction(turns: unknown, path: string): Promise<Result<AssistantReply>> {
  try {
    return { ok: true, data: await runAssistant(history.parse(turns), { path: z.string().max(300).catch("/").parse(path) }) }
  } catch (error) {
    return { ok: false, message: message(error) }
  }
}

/** Applies one suggestion the user clicked. Returns where to go next, if anywhere. */
export async function applyProposalAction(raw: Proposal): Promise<Result<{ href?: string; done: string }>> {
  try {
    const proposal = proposalSchema.parse(raw)
    if (proposal.kind === "application") {
      const { status, nextStep, archived } = proposal
      const nextStepDue = proposal.nextStepDue ? new Date(`${proposal.nextStepDue}T09:00:00`).toISOString() : undefined
      await apiUpdateApplication(proposal.id, { status, nextStep, nextStepDue, archived })
      revalidatePath("/", "layout")
      return { ok: true, data: { done: `Updated ${proposal.label}`, href: `/applications/${proposal.id}` } }
    }
    if (proposal.kind === "contact") {
      await saveContact({ ...proposal, source: "manual" })
      revalidatePath("/contacts")
      return { ok: true, data: { done: `${proposal.name} added to contacts`, href: "/contacts" } }
    }
    if (proposal.kind === "job") {
      const known = canonicalJobUrl(proposal.url)
      const id = await saveCapture({ url: known?.url ?? proposal.url, board: known?.board ?? new URL(proposal.url).hostname.replace(/^www\./, ""), title: "", text: "" })
      return { ok: true, data: { done: "Job link saved", href: `/jobs/new?lead=${id}` } }
    }
    return { ok: true, data: { done: "", href: proposal.path } }
  } catch (error) {
    return { ok: false, message: message(error) }
  }
}
