import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { ChevronRightIcon, FileTextIcon, KanbanIcon, ListIcon, PlusIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { FitRing } from "@/components/applications/fit-ring"
import { Board } from "@/components/tracking/board"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Role</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="hidden md:table-cell">Evidence</TableHead>
            <TableHead className="text-right">Fit</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Updated</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((application) => {
            const analysis = application.analysis as StoredAnalysis | null
            return (
              <TableRow key={application.id}>
                <TableCell className="pl-4">
                  <Link href={`/applications/${application.id}`} className="flex min-w-0 items-center gap-3">
                    <EntryLogo path={application.job.company?.logoPath} name={application.job.company?.name ?? "?"} size={32} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{application.job.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{application.job.company?.name}</div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={application.status === "ready" ? "default" : "secondary"}>{STATUS_LABEL[application.status]}</Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{analysis ? `${analysis.counts.met} proven · ${analysis.counts.gap} not in profile` : "—"}</TableCell>
                <TableCell className="text-right">
                  <FitRing score={analysis?.fitScore} className="ml-auto" />
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{application.updatedAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</TableCell>
                <TableCell>
                  <Button size="icon-sm" variant="ghost" aria-label="Open" nativeButton={false} render={<Link href={`/applications/${application.id}`} />}>
                    <ChevronRightIcon />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}
