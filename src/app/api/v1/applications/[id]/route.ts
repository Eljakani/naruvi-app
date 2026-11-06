import { revalidatePath } from "next/cache"
import { z } from "zod"
import { api, NotFound } from "@/server/integrations/api"
import { apiApplication, apiUpdateApplication, updateBody } from "@/server/integrations/api-data"

type Context = RouteContext<"/api/v1/applications/[id]">
const id = async (context: Context) => {
  const { id } = await context.params
  if (!z.string().uuid().safeParse(id).success) throw new NotFound("Application not found.")
  return id
}

/** One application with its analysis summary and emails. */
export const GET = api(async (_request: Request, context: Context) => apiApplication(await id(context)))

/** Change status (manual stages only), next step, due date or archive. */
export const PATCH = api(async (request: Request, context: Context) => {
  const applicationId = await id(context)
  const result = await apiUpdateApplication(applicationId, updateBody.parse(await request.json()))
  revalidatePath("/applications")
  revalidatePath(`/applications/${applicationId}`)
  revalidatePath("/")
  return result
})
