"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { analyzeJob } from "@/server/applications/repository"
import { moveApplication } from "@/server/tracking/service"

/** Form action: analyze a job against the profile, then open the application. */
export async function analyzeJobAction(formData: FormData) {
  const jobId = z.string().uuid().parse(formData.get("jobId"))
  const application = await analyzeJob(jobId)
  revalidatePath("/applications")
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/")
  redirect(`/applications/${application.id}`)
}

const statusSchema = z.enum(["draft", "parsed", "analyzed", "generated", "ready", "submitted", "interviewing", "offer", "rejected", "withdrawn"])

/** Board move or "Move to" menu: set the status by hand and record it. */
export async function moveApplicationAction(id: string, status: string, note = ""): Promise<{ ok: boolean; message?: string }> {
  const parsed = z.object({ id: z.string().uuid(), status: statusSchema, note: z.string().max(500) }).safeParse({ id, status, note })
  if (!parsed.success) return { ok: false, message: "Invalid move." }
  try {
    await moveApplication(parsed.data.id, parsed.data.status, parsed.data.note)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn’t move the application." }
  }
  revalidatePath("/applications")
  revalidatePath(`/applications/${parsed.data.id}`)
  revalidatePath("/")
  return { ok: true }
}
