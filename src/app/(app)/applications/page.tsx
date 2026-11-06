import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArchiveIcon, ChevronRightIcon, FileTextIcon, KanbanIcon, ListIcon, PlusIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { FitRing } from "@/components/applications/fit-ring"
import { Board } from "@/components/tracking/board"
import { ArchiveAllButton, ArchiveButton, NextStep } from "@/components/tracking/next-step"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CLOSED } from "@/lib/attention"
import { STATUS_LABEL } from "@/lib/stages"
import { cn } from "@/lib/utils"
import { ClearFilters, SearchBox, UrlSelect } from "@/components/list-toolbar"
import { APPLICATION_SORTS, listApplications, type ApplicationSort, type StoredAnalysis } from "@/server/applications/repository"
import { displayFitScore } from "@/server/analysis/match"
import { stageSince } from "@/server/tracking/service"
import { mailInbox } from "@/server/mail/classify"

export const metadata = { title: "Applications" }

export default function ApplicationsPage({ searchParams }: PageProps<"/applications">) {
  return (
    <>
      <PageHeader
        title="Applications"
        description="Track every application from first analysis to offer. Drag a card or use its menu to move or archive it."
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

type Search = Promise<Record<string, string | string[] | undefined>>
type Show = "active" | "closed" | "archived"
const showOf = (value: unknown): Show => (value === "closed" || value === "archived" ? value : "active")

async function ViewSwitch({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const view = params.view === "list" ? "list" : "board"
  const show = showOf(params.show)
  const link = (next: { view?: string; show?: Show }) => {
    const query = new URLSearchParams()
    const v = next.view ?? view
    const s = next.show ?? show
    if (v === "list") query.set("view", "list")
    if (s !== "active") query.set("show", s)
    const text = query.toString()
    return text ? `/applications?${text}` : "/applications"
  }
  return (
    <div className="flex flex-wrap gap-2">
      <div className="flex gap-1 rounded-lg bg-muted p-0.5" role="group" aria-label="Which applications">
        {(["active", "closed", "archived"] as const).map((item) => (
          <Button key={item} size="sm" variant={show === item ? "secondary" : "ghost"} className={cn(show === item && "bg-background shadow-xs")} nativeButton={false} render={<Link href={link({ show: item })} />}>
            {item === "active" ? "Active" : item === "closed" ? "Closed" : "Archived"}
          </Button>
        ))}
      </div>
      {show === "active" ? (
        <div className="flex gap-1">
          <Button size="sm" variant={view === "board" ? "secondary" : "ghost"} nativeButton={false} render={<Link href={link({ view: "board" })} />}>
            <KanbanIcon /> Board
          </Button>
          <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} nativeButton={false} render={<Link href={link({ view: "list" })} />}>
            <ListIcon /> List
          </Button>
        </div>
      ) : null}
    </div>
  )
}

async function List({ searchParams }: { searchParams: Search }) {
  await connection()
  const params = await searchParams
  const show = showOf(params.show)
  const view = show === "active" && params.view !== "list" ? "board" : "list"
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : undefined
  const sort = typeof params.sort === "string" && Object.hasOwn(APPLICATION_SORTS, params.sort) ? (params.sort as ApplicationSort) : undefined
  const [all, since, inbox] = await Promise.all([listApplications({ archived: show === "archived", q, sort }), stageSince(), mailInbox()])
  const applications = show === "archived" ? all : all.filter((application) => (show === "closed") === CLOSED.includes(application.status))
  const closedCount = show === "active" ? all.filter((application) => CLOSED.includes(application.status)).length : 0
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox placeholder="Search role, company, location…" />
      <ClearFilters names={["q"]} />
      <div className="ml-auto flex items-center gap-2">
        {q ? <span className="text-sm text-muted-foreground tabular-nums">{applications.length} match{applications.length === 1 ? "" : "es"}</span> : null}
        {view === "list" ? <UrlSelect name="sort" label="Sort" options={Object.entries(APPLICATION_SORTS).map(([value, label]) => ({ value, label }))} className="w-44" /> : null}
      </div>
    </div>
  )
  if (!all.length && show === "active" && !q) {
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
      <div className="grid gap-3">
        {toolbar}
        {q && !all.length ? <p className="text-sm text-muted-foreground">No application matches “{q}”.</p> : null}
        <Board
          closedHref="/applications?show=closed"
          items={all.map((application) => ({
            id: application.id,
            title: application.job.title,
            company: application.job.company?.name ?? "",
            logoPath: application.job.company?.logoPath ?? null,
            status: application.status,
            fit: displayFitScore(application.analysis as StoredAnalysis | null),
            since: (since.get(application.id) ?? application.createdAt).toISOString(),
            nextStep: application.nextStep,
            nextStepDue: application.nextStepDue?.toISOString() ?? null,
            unread: inbox.unread.get(application.id) ?? 0,
          }))}
        />
      </div>
    )
  }
  if (!applications.length) {
    return (
      <div className="grid gap-3">
        {toolbar}
        <EmptyState show={show} q={q} />
      </div>
    )
  }
  return (
    <div className="grid gap-3">
      {toolbar}
      <ApplicationTable applications={applications} show={show} closedCount={closedCount} />
    </div>
  )
}

function EmptyState({ show, q }: { show: Show; q?: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ArchiveIcon />
        </EmptyMedia>
        <EmptyTitle>{show === "archived" ? "Nothing archived" : show === "closed" ? "No closed applications" : "No active applications"}</EmptyTitle>
        <EmptyDescription>{q ? `Nothing matches “${q}” here.` : show === "archived" ? "Archive applications you’re done with to keep the board short. They stay here and can be restored." : show === "closed" ? "Rejected and withdrawn applications show up here." : "Everything is closed or archived."}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function ApplicationTable({ applications, show, closedCount }: { applications: Awaited<ReturnType<typeof listApplications>>; show: Show; closedCount: number }) {
  return (
    <div className="grid gap-3">
      {show === "closed" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">Closed applications stay on the board’s Closed tile until you archive them.</span>
          <ArchiveAllButton ids={applications.map((application) => application.id)} />
        </div>
      ) : null}
      {show === "active" && closedCount ? (
        <p className="text-sm text-muted-foreground">
          {closedCount} closed application{closedCount === 1 ? "" : "s"} hidden.{" "}
          <Link href="/applications?show=closed" className="underline underline-offset-2">Show them</Link>
        </p>
      ) : null}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Role</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="hidden lg:table-cell">Next step</TableHead>
              <TableHead className="hidden md:table-cell">Evidence</TableHead>
              <TableHead className="text-right">Fit</TableHead>
              <TableHead className="hidden text-right sm:table-cell">{show === "archived" ? "Archived" : "Updated"}</TableHead>
              <TableHead className="w-10 pr-4" />
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
                  <TableCell className="hidden max-w-64 lg:table-cell">
                    {application.nextStep || application.nextStepDue ? <NextStep id={application.id} nextStep={application.nextStep} due={application.nextStepDue?.toISOString() ?? null} size="sm" /> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{analysis ? `${analysis.counts.met} proven · ${analysis.counts.gap} not in profile` : "—"}</TableCell>
                  <TableCell className="text-right">
                    <FitRing score={displayFitScore(analysis)} className="ml-auto" />
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{(application.archivedAt ?? application.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</TableCell>
                  <TableCell className="pr-4">
                    {show === "active" ? (
                      <Button size="icon-sm" variant="ghost" aria-label="Open" nativeButton={false} render={<Link href={`/applications/${application.id}`} />}>
                        <ChevronRightIcon />
                      </Button>
                    ) : (
                      <ArchiveButton id={application.id} archived={show === "archived"} size="sm" />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
