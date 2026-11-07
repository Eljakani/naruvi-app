import { Suspense } from "react"
import { AlertTriangleIcon, BriefcaseBusinessIcon, CalendarIcon, ExternalLinkIcon, GlobeIcon, MapPinIcon, WalletIcon } from "lucide-react"
import { JobDescription } from "@/components/jobs/job-description"
import { JobInsights } from "@/components/jobs/job-insights"
import { JobTags } from "@/components/jobs/job-tags"
import { SalaryCard } from "@/components/jobs/salary-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { allTags } from "@/server/companies/repository"
import type { getJob } from "@/server/jobs/ingest"
import type { JobInsights as Insights } from "@/server/jobs/enrich"
import { salaryContext } from "@/server/salary/market"

type Job = NonNullable<Awaited<ReturnType<typeof getJob>>>

/** The posting itself: key facts, tags, insights, pay and the original text. Shared by Discover and the application page. */
export async function JobOverview({ job }: { job: Job }) {
  const tags = await allTags()
  const chips = [
    job.location && { icon: MapPinIcon, text: job.location },
    job.remote && { icon: GlobeIcon, text: job.remote },
    job.employmentType && { icon: BriefcaseBusinessIcon, text: job.employmentType },
    job.salary && { icon: WalletIcon, text: job.salary },
    job.postedAt && { icon: CalendarIcon, text: `Posted ${job.postedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` },
  ].filter(Boolean) as { icon: React.ElementType; text: string }[]
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <Badge key={chip.text} variant="secondary" className="h-6 gap-1 font-normal">
            <chip.icon className="size-3" /> {chip.text}
          </Badge>
        ))}
        <Badge variant="outline" className="h-6 font-mono text-[11px] uppercase">{job.language}</Badge>
        <JobTags jobId={job.id} tags={job.tags} suggestions={tags.map((item) => item.tag)} />
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

      <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
        <Pay job={job} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Job description</CardTitle>
          <CardDescription>Original text, kept unchanged. Treated as untrusted input by every AI step.</CardDescription>
          {job.sourceUrl ? (
            <CardAction>
              <Button variant="outline" size="sm" nativeButton={false} render={<a href={job.sourceUrl} target="_blank" rel="noreferrer" />}>
                <ExternalLinkIcon /> Original posting
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <JobDescription text={job.rawText} />
        </CardContent>
      </Card>
    </div>
  )
}

async function Pay({ job }: { job: Job }) {
  return <SalaryCard context={await salaryContext(job)} />
}
