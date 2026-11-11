import { z } from "zod"
import { canonicalJobUrl } from "@/lib/job-alerts"
import { api } from "@/server/integrations/api"
import { saveCapture } from "@/server/jobs/leads"

const body = z.object({ url: z.string().url().max(2000).refine((url) => /^https?:\/\//.test(url)), title: z.string().max(300).default(""), text: z.string().max(120_000).default("") })

/** The browser extension sends the page you're on; Naruvi keeps it as a job lead and returns where to review it. */
export const POST = api(async (request: Request) => {
  const input = body.parse(await request.json())
  const known = canonicalJobUrl(input.url)
  const id = await saveCapture({ url: known?.url ?? input.url, board: known?.board ?? new URL(input.url).hostname.replace(/^www\./, ""), title: input.title.trim(), text: input.text.trim() })
  const origin = new URL(request.url).origin
  return { id, review: `${origin}/jobs?lead=${id}` }
})
