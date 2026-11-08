import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"
import { AnalyzeButton } from "@/components/applications/analyze-button"
import { JobOverview } from "@/components/jobs/job-overview"
import { TrackJobButton } from "@/components/jobs/track-job-button"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { applicationForJob } from "@/server/applications/repository"
import { getJob } from "@/server/jobs/ingest"

export const metadata = { title: "Job" }

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <JobDetail params={params} />
    </Suspense>
  )
}

/**
 * A posting you haven't started tracking. Once it's tracked, the posting lives
 * in its application's Overview tab, so old links go there.
 */
async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const job = await getJob(id)
  if (!job) notFound()
  const application = await applicationForJob(job.id)
  if (application) redirect(`/applications/${application.id}?tab=overview`)
  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/jobs" />}>
        <ArrowLeftIcon /> Jobs
      </Button>
      <div className="flex flex-wrap items-start gap-4">
        <EntryLogo path={job.company?.logoPath} name={job.company?.name ?? "?"} size={56} morph={`job-${job.id}`} />
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{job.title}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {job.company ? <Link href={`/companies/${job.company.id}`} className="font-medium text-foreground hover:underline">{job.company.name}</Link> : null}
            {job.company?.website ? (
              <a href={job.company.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                {new URL(job.company.website).hostname} <ExternalLinkIcon className="size-3" />
              </a>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TrackJobButton jobId={job.id} />
          <AnalyzeButton jobId={job.id} label="Track & check my fit" />
        </div>
      </div>
      <JobOverview job={job} />
    </div>
  )
}
