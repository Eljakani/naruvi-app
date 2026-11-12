import { z } from "zod"
import { api } from "@/server/integrations/api"
import { logoDataUrl, lookupPage } from "@/server/integrations/extension"

const query = z.object({ url: z.string().url().max(2000) })

/** GET /api/v1/lookup?url=…: is this page already a saved job, or this profile already a contact? */
export const GET = api(async (request: Request) => {
  const { url } = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  const found = await lookupPage(url)
  const origin = new URL(request.url).origin
  return {
    job: found.job ? { id: found.job.id, title: found.job.title, company: found.job.company, status: found.job.status, logo: await logoDataUrl(found.job.logoPath), open: `${origin}/${found.job.applicationId ? `applications/${found.job.applicationId}` : `jobs/${found.job.id}`}` } : null,
    contact: found.contact ? { ...found.contact, open: `${origin}/contacts?q=${encodeURIComponent(found.contact.name)}` } : null,
  }
})
