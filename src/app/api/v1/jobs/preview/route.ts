import { z } from "zod"
import { api } from "@/server/integrations/api"
import { logoDataUrl } from "@/server/integrations/extension"
import { findDuplicates } from "@/server/companies/repository"
import { previewJob } from "@/server/jobs/ingest"

const body = z.object({
  url: z.string().url().max(2000).refine((url) => /^https?:\/\//.test(url)),
  text: z.string().max(120_000).default(""),
  /** The page as the browser rendered it (scripts stripped, JSON-LD kept). */
  html: z.string().max(380_000).default(""),
})

/** POST /api/v1/jobs/preview: read a posting into a draft to review. Saves nothing. */
export const POST = api(async (request: Request) => {
  const input = body.parse(await request.json())
  const draft = await previewJob(input)
  const duplicates = await findDuplicates(draft).catch(() => [])
  const origin = new URL(request.url).origin
  return {
    draft,
    logo: await logoDataUrl(draft.logoPath),
    duplicates: duplicates.map((item) => ({ id: item.id, title: item.title, company: item.company, sameLink: item.sameLink, status: item.status, open: `${origin}/jobs/${item.id}` })),
  }
})
