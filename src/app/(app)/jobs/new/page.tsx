import { Suspense } from "react"
import { NewJobFlow } from "@/components/jobs/new-job-flow"

export const metadata = { title: "Add a job" }

export default function NewJobPage({ searchParams }: PageProps<"/jobs/new">) {
  return (
    <Suspense fallback={<NewJobFlow />}>
      <WithLink searchParams={searchParams} />
    </Suspense>
  )
}

/** `?url=` pre-fills the link (job leads, the browser extension). */
async function WithLink({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const url = (await searchParams).url
  const initial = typeof url === "string" && /^https?:\/\//.test(url) ? url.slice(0, 2000) : ""
  return <NewJobFlow key={initial} initialUrl={initial} />
}
