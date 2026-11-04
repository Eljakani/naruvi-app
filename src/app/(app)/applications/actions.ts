"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { analyzeJob } from "@/server/applications/repository"

/** Form action: analyze a job against the profile, then open the application. */
export async function analyzeJobAction(formData: FormData) {
  const jobId = z.string().uuid().parse(formData.get("jobId"))
  const application = await analyzeJob(jobId)
  revalidatePath("/applications")
  revalidatePath(`/jobs/${jobId}`)
  revalidatePath("/")
  redirect(`/applications/${application.id}`)
}
