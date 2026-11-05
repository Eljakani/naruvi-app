import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { ChevronRightIcon, FileTextIcon, KanbanIcon, ListIcon, PlusIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Board } from "@/components/tracking/board"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { STATUS_LABEL } from "@/lib/stages"
import { listApplications, type StoredAnalysis } from "@/server/applications/repository"
import { stageSince } from "@/server/tracking/service"

export const metadata = { title: "Applications" }

export default function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  return (
    <>
      <PageHeader
        title="Applications"
        description="Track every application from first analysis to offer. Drag a card or use its menu to move it."
        actions={
          <Suspense fallback={null}>
            <ViewSwitch searchParams={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function ViewSwitch({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const view = (await searchParams).view === "list" ? "list" : "board"
  return (
    <div className="flex gap-1">
      <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} nativeButton={false} render={<Link href="/applications" />}>
        <KanbanIcon /> Board
      </Button>
      <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} nativeButton={false} render={<Link href="/applications?view=list" />}>
        <ListIcon /> List
      </Button>
    </div>
  )
}

async function List({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection()
  const view = (await searchParams).view === "list" ? "list" : "board"
  const [applications, since] = await Promise.all([listApplications(), stageSince()])
  if (!applications.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>No applications yet</EmptyTitle>
          <EmptyDescription>Open a job and click “Analyze my fit” to start one.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/jobs" />}>
            <PlusIcon /> Go to jobs
          </Button>
        </EmptyContent>
      </Empty>
    )
  }
  if (view === "board") {
    return (
      <Board
        items={applications.map((application) => ({
          id: application.id,
          title: application.job.title,
          company: application.job.company?.name ?? "",
          logoPath: application.job.company?.logoPath ?? null,
          status: application.status,
          fit: (application.analysis as StoredAnalysis | null)?.fitScore ?? null,
          since: (since.get(application.id) ?? application.createdAt).toISOString(),
        }))}
      />
    )
  }
  return (
    <div className="grid gap-3">
      {applications.map((application) => {
        const analysis = application.analysis as StoredAnalysis | null
        const score = analysis?.fitScore ?? null
        return (
          <Link key={application.id} href={`/applications/${application.id}`} className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Card className="flex flex-row items-center gap-4 px-5 py-4 transition-colors group-hover:bg-muted/40">
              <EntryLogo path={application.job.company?.logoPath} name={application.job.company?.name ?? "?"} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{application.job.title}</div>
                <div className="truncate text-sm text-muted-foreground">{application.job.company?.name}</div>
              </div>
              {analysis ? (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {analysis.counts.met} proven · {analysis.counts.gap} not in profile
                </span>
              ) : null}
              <Badge variant="secondary">{STATUS_LABEL[application.status]}</Badge>
              {score !== null ? (
                <span className={cn("w-12 text-right text-lg font-semibold tabular-nums", score >= 75 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-rose-600")}>{score}</span>
              ) : null}
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
