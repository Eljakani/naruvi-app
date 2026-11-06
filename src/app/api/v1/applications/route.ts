import { api } from "@/server/integrations/api"
import { apiApplications, listQuery } from "@/server/integrations/api-data"

/** GET /api/v1/applications?show=active|closed|archived|all&q=… */
export const GET = api(async (request: Request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  return apiApplications(listQuery.parse(params))
})
