import { Suspense } from "react"
import { NewJobFlow } from "@/components/jobs/new-job-flow"
import { ReviewFromStorage } from "@/components/jobs/review-from-storage"
import { getLead } from "@/server/jobs/leads"
import { titled } from "@/i18n/metadata"

export const generateMetadata = titled("addJob")

export default function NewJobPage({ searchParams }: PageProps<"/[locale]/jobs/new">) {
  return (
    <Suspense fallback={<NewJobFlow />}>
      <WithLink searchParams={searchParams} />
    </Suspense>
  )
}

/** `?url=` pre-fills the link; `?lead=` a job lead or a page saved by the browser extension (with its text). */
async function WithLink({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  if (params.review === "1") return <ReviewFromStorage />
  const lead = typeof params.lead === "string" && /^[0-9a-f-]{36}$/i.test(params.lead) ? await getLead(params.lead) : null
  if (lead) return <NewJobFlow key={lead.id} initialUrl={lead.url} initialText={lead.text ?? ""} />
  const url = typeof params.url === "string" && /^https?:\/\//.test(params.url) ? params.url.slice(0, 2000) : ""
  return <NewJobFlow key={url} initialUrl={url} />
}
