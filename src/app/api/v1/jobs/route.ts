import { z } from "zod"
import { api } from "@/server/integrations/api"
import { saveAndTrackJob } from "@/server/integrations/extension"
import { jobDraft } from "@/server/jobs/schema"
import { JOB_SORTS, searchJobs } from "@/server/jobs/search"

const query = z.object({ q: z.string().max(200).optional(), sort: z.enum(Object.keys(JOB_SORTS) as [keyof typeof JOB_SORTS]).optional(), page: z.coerce.number().int().min(1).max(1000).default(1) })

/** GET /api/v1/jobs?q=…&sort=newest|oldest|fit|company&page=1 */
export const GET = api(async (request: Request) => {
  const params = query.parse(Object.fromEntries(new URL(request.url).searchParams))
  const result = await searchJobs(params)
  return {
    page: result.page,
    pages: result.pages,
    total: result.total,
    jobs: result.jobs.map((job) => ({ id: job.id, title: job.title, company: job.company, location: job.location || null, tags: job.tags, applicationId: job.applicationId, status: job.status, fit: job.fit, addedAt: job.createdAt.toISOString() })),
  }
})

/** POST /api/v1/jobs: save a reviewed draft (from /jobs/preview) and start tracking it. */
export const POST = api(async (request: Request) => {
  const draft = jobDraft.parse(await request.json())
  const { id, applicationId } = await saveAndTrackJob(draft)
  const origin = new URL(request.url).origin
  return { id, applicationId, open: `${origin}/${applicationId ? `applications/${applicationId}` : `jobs/${id}`}` }
})
