import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react"
import { AnalysisView } from "@/components/applications/analysis-view"
import { AnalyzeButton } from "@/components/applications/analyze-button"
import { EntryLogo } from "@/components/profile/entry-logo"
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
  const application = await getApplication(id)
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
        <AnalyzeButton jobId={job.id} label="Re-analyze" variant="outline" />
      </div>
      {application.analysis ? <AnalysisView analysis={application.analysis} facts={application.facts} cvHref={`/applications/${application.id}/cv?lang=${application.language}`} research={{ applicationId: application.id, jobId: job.id, company: job.company?.name ?? "the company", language: application.language, initial: (job.company?.research ?? null) as unknown as Research | null }} /> : <p className="text-sm text-muted-foreground">Not analyzed yet.</p>}
    </div>
  )
}
