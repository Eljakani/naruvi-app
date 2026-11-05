import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { BriefcaseBusinessIcon, ChevronRightIcon, MapPinIcon, PlusIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { listJobs } from "@/server/jobs/ingest"

export const metadata = { title: "Jobs" }

export default function JobsPage() {
  return (
    <>
      <PageHeader
        title="Jobs"
        description="Postings you're considering. Each one keeps its original text, unchanged."
        actions={
          <Button nativeButton={false} render={<Link href="/jobs/new" />}>
            <PlusIcon /> Add a job
          </Button>
        }
      />
      <Suspense fallback={<div className="grid gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>}>
        <JobList />
      </Suspense>
    </>
  )
}

const BOARD_LABEL: Record<string, string> = { linkedin: "LinkedIn", greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby", smartrecruiters: "SmartRecruiters", workday: "Workday", manual: "Pasted", generic: "Careers page", "job-board": "Job board" }

async function JobList() {
  await connection()
  const jobs = await listJobs()
  if (!jobs.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BriefcaseBusinessIcon />
          </EmptyMedia>
          <EmptyTitle>No jobs yet</EmptyTitle>
          <EmptyDescription>Paste a link from LinkedIn, Greenhouse, Lever, Ashby, Workday or any careers page.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/jobs/new" />}>
            <PlusIcon /> Add your first job
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  return (
    <div className="grid gap-3">
      {jobs.map((job) => (
        <Link key={job.id} href={`/jobs/${job.id}`} className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <Card className="flex flex-row items-center gap-4 px-5 py-4 transition-colors group-hover:bg-muted/40">
            <EntryLogo path={job.company?.logoPath} name={job.company?.name ?? "?"} size={44} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="truncate font-medium">{job.title}</div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{job.company?.name}</span>
                {job.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPinIcon className="size-3" /> {job.location}
                  </span>
                ) : null}
                {job.remote ? <span>{job.remote}</span> : null}
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {job.language}
              </Badge>
              <Badge variant="secondary">{BOARD_LABEL[job.board] ?? job.board}</Badge>
              <span className="w-20 text-right text-xs text-muted-foreground">{job.createdAt.toLocaleDateString()}</span>
            </div>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Card>
        </Link>
      ))}
    </div>
  )
}
