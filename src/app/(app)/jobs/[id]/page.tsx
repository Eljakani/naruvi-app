import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { AlertTriangleIcon, ArrowLeftIcon, BriefcaseBusinessIcon, CalendarIcon, ExternalLinkIcon, GlobeIcon, MapPinIcon, ScanSearchIcon, WalletIcon } from "lucide-react"
import { JobDescription } from "@/components/jobs/job-description"
import { JobInsights } from "@/components/jobs/job-insights"
import type { JobInsights as Insights } from "@/server/jobs/enrich"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getJob } from "@/server/jobs/ingest"
import { applicationForJob } from "@/server/applications/repository"
import { AnalyzeButton } from "@/components/applications/analyze-button"
import { JobTags } from "@/components/jobs/job-tags"
import { allTags } from "@/server/companies/repository"

export const metadata = { title: "Job" }

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <JobDetail params={params} />
    </Suspense>
  )
}

async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const job = await getJob(id)
  if (!job) notFound()
  const [application, tagSuggestions] = await Promise.all([applicationForJob(job.id), allTags()])
  const chips = [
    job.location && { icon: MapPinIcon, text: job.location },
    job.remote && { icon: GlobeIcon, text: job.remote },
    job.employmentType && { icon: BriefcaseBusinessIcon, text: job.employmentType },
    job.salary && { icon: WalletIcon, text: job.salary },
    job.postedAt && { icon: CalendarIcon, text: `Posted ${job.postedAt.toLocaleDateString()}` },
  ].filter(Boolean) as { icon: React.ElementType; text: string }[]
  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/jobs" />}>
        <ArrowLeftIcon /> Jobs
      </Button>
      <div className="flex flex-wrap items-start gap-4">
        <EntryLogo path={job.company?.logoPath} name={job.company?.name ?? "?"} size={64} morph={`job-${job.id}`} />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {job.company ? (
              <Link href={`/companies/${job.company.id}`} className="font-medium text-foreground hover:underline">
                {job.company.name}
              </Link>
            ) : null}
            {job.company?.website ? (
              <a href={job.company.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                {new URL(job.company.website).hostname} <ExternalLinkIcon className="size-3" />
              </a>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Badge key={chip.text} variant="secondary" className="gap-1 font-normal">
                <chip.icon className="size-3" /> {chip.text}
              </Badge>
            ))}
            <Badge variant="outline" className="font-mono text-[11px] uppercase">
              {job.language}
            </Badge>
          </div>
          <JobTags jobId={job.id} tags={job.tags} suggestions={tagSuggestions.map((item) => item.tag)} />
        </div>
        <div className="flex gap-2">
          {job.sourceUrl ? (
            <Button variant="outline" nativeButton={false} render={<a href={job.sourceUrl} target="_blank" rel="noreferrer" />}>
              <ExternalLinkIcon /> Original
            </Button>
          ) : null}
          {application ? (
            <>
              <AnalyzeButton jobId={job.id} label="Re-analyze" variant="outline" />
              <Button nativeButton={false} render={<Link href={`/applications/${application.id}`} />}>
                <ScanSearchIcon /> Open analysis
              </Button>
            </>
          ) : (
            <AnalyzeButton jobId={job.id} />
          )}
        </div>
      </div>

      {job.parseWarnings.length ? (
        <div className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          {job.parseWarnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" /> {warning}
            </p>
          ))}
        </div>
      ) : null}

      <JobInsights jobId={job.id} insights={(job.insights ?? null) as unknown as Insights | null} />

      <Card>
        <CardHeader>
          <CardTitle>Job description</CardTitle>
          <CardDescription>Original text, kept unchanged. Treated as untrusted input by every AI step.</CardDescription>
        </CardHeader>
        <CardContent>
          <JobDescription text={job.rawText} />
        </CardContent>
      </Card>
    </div>
  )
}
