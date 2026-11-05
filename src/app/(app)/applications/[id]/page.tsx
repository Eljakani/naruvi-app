import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"
import { AnalysisView } from "@/components/applications/analysis-view"
import { AnalyzeButton } from "@/components/applications/analyze-button"
import { ApplicationNav } from "@/components/applications/application-nav"
import { EntryLogo } from "@/components/profile/entry-logo"
import { StatusControl } from "@/components/tracking/status-control"
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
        <StatusControl id={application.id} status={application.status} />
        <AnalyzeButton jobId={job.id} label="Re-analyze" variant="outline" />
      </div>
      <ApplicationNav applicationId={application.id} current="analysis" language={application.language} />
      {application.analysis ? <AnalysisView analysis={application.analysis} facts={application.facts} cvHref={`/applications/${application.id}/cv?lang=${application.language}`} research={{ applicationId: application.id, jobId: job.id, company: job.company?.name ?? "the company", language: application.language, initial: (job.company?.research ?? null) as unknown as Research | null }} /> : <p className="text-sm text-muted-foreground">Not analyzed yet.</p>}
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
