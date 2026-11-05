"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { researchForJob } from "@/server/research/service"

export async function researchCompanyAction(applicationId: string, jobId: string, force = false, language?: string) {
  try {
    const brief = await researchForJob(z.string().uuid().parse(jobId), { force, language })
    revalidatePath(`/applications/${z.string().uuid().parse(applicationId)}`, "layout")
    return { ok: true as const, data: brief }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}
