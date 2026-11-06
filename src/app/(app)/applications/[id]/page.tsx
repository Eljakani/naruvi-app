import Link from "next/link"
import { notFound } from "next/navigation"
import { scheduleResearch } from "@/server/research/auto"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArchiveIcon, ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"
import { AnalysisView } from "@/components/applications/analysis-view"
import { AnalyzeButton } from "@/components/applications/analyze-button"
import { ApplicationNav } from "@/components/applications/application-nav"
import { EntryLogo } from "@/components/profile/entry-logo"
import { ArchiveButton, NextStep } from "@/components/tracking/next-step"
import { StatusControl } from "@/components/tracking/status-control"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { STATUS_LABEL } from "@/lib/stages"
import { listEvents } from "@/server/tracking/service"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getApplication } from "@/server/applications/repository"
import type { CompanyResearch as Research } from "@/server/research/brief"

export const metadata = { title: "Application" }

export default function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ApplicationDetail params={params} />
    </Suspense>
  )
}

async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const [application, events] = await Promise.all([getApplication(id), listEvents(id)])
  if (!application) notFound()
  const { job } = application
  // No research yet: start it in the background; the card fills in when it lands.
  const researching = Boolean(job.company) && !job.company?.research
  if (researching) scheduleResearch(job.id)
  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/applications" />}>
        <ArrowLeftIcon /> Applications
      </Button>
      <div className="flex flex-wrap items-center gap-4">
        <EntryLogo path={job.company?.logoPath} name={job.company?.name ?? "?"} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {job.company?.name}
            {job.location ? ` · ${job.location}` : ""} ·{" "}
            <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1 hover:underline">
              job description <ExternalLinkIcon className="size-3" />
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NextStep id={application.id} nextStep={application.nextStep} due={application.nextStepDue?.toISOString() ?? null} />
          <StatusControl id={application.id} status={application.status} />
          <ArchiveButton id={application.id} archived={Boolean(application.archivedAt)} />
          <AnalyzeButton jobId={job.id} label="Re-analyze" variant="outline" />
        </div>
      </div>
      {application.archivedAt ? (
        <Alert>
          <ArchiveIcon />
          <AlertTitle>Archived on {application.archivedAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</AlertTitle>
          <AlertDescription>It’s hidden from the board and the dashboard. Restore it to work on it again.</AlertDescription>
        </Alert>
      ) : null}
      <ApplicationNav applicationId={application.id} current="analysis" language={application.language} />
      {application.analysis ? <AnalysisView analysis={application.analysis} facts={application.facts} cvHref={`/applications/${application.id}/cv?lang=${application.language}`} research={{ applicationId: application.id, jobId: job.id, company: job.company?.name ?? "the company", language: application.language, initial: (job.company?.research ?? null) as unknown as Research | null, researching }} /> : <p className="text-sm text-muted-foreground">Not analyzed yet.</p>}
      {events.length ? (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2">
              {events.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {event.fromStatus ? `${STATUS_LABEL[event.fromStatus]} → ` : ""}
                    {STATUS_LABEL[event.toStatus]}
                    {event.actor === "system" ? <span className="text-muted-foreground"> · automatic</span> : null}
                  </span>
                  <time className="text-muted-foreground" dateTime={event.createdAt.toISOString()}>
                    {event.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
