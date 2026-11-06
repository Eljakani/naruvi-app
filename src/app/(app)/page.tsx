import Link from "next/link"
import { Suspense } from "react"
import { ArrowRightIcon, BriefcaseBusinessIcon, CheckCircle2Icon, ChevronRightIcon, CircleIcon, FileTextIcon, PlusIcon, SendIcon, UserRoundCheckIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { FitRing } from "@/components/applications/fit-ring"
import { EntryLogo } from "@/components/profile/entry-logo"
import { NeedsAttention } from "@/components/tracking/needs-attention"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { LiveRefresh } from "@/components/refresh-runs"
import { ago, workflowLabel } from "@/components/runs/labels"
import { WorkflowIcon } from "@/components/runs/workflow-icon"
import { COLUMNS } from "@/lib/stages"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { StoredAnalysis } from "@/server/applications/repository"
import { displayFitScore } from "@/server/analysis/match"
import { getDashboard } from "@/server/queries/dashboard"

export const metadata = { title: "Dashboard" }

const PIPELINE = COLUMNS.filter((column) => column.id !== "closed")
const STAGE_COLOR = {
  preparing: "bg-chart-1",
  documents: "bg-chart-2",
  sent: "bg-chart-3",
  interviewing: "bg-chart-4",
  offer: "bg-chart-5",
}
const RUN_STATUS = {
  queued: "Queued",
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
} as const

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  parsed: "Draft",
  analyzed: "Analyzed",
  generated: "CV drafted",
  ready: "Ready to send",
  submitted: "Sent",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Closed",
  withdrawn: "Withdrawn",
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Where your applications stand and what to do next."
        actions={
          <Button nativeButton={false} render={<Link href="/jobs" />}>
            <PlusIcon /> New application
          </Button>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

function relative(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  if (minutes < 60) return rtf.format(-minutes, "minute")
  if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), "hour")
  return rtf.format(-Math.round(minutes / 1440), "day")
}

async function DashboardData() {
  const data = await getDashboard()
  const sum = (keys: readonly string[]) => keys.reduce((total, key) => total + (data.statusCounts[key] ?? 0), 0)
  const pipeline = PIPELINE.map((stage) => ({ ...stage, count: sum(stage.statuses) }))
  const active = pipeline.reduce((total, stage) => total + stage.count, 0)
  const busy = data.recentRuns.some((run) => run.status === "running" || run.status === "queued")

  const setup = [
    { done: data.hasProfile && data.verifiedFacts > 0, label: "Build your profile", detail: "Add experience and verify the facts your documents will cite.", href: "/profile", icon: UserRoundCheckIcon },
    { done: data.jobs > 0, label: "Add a job", detail: "Paste a link or the description of any posting.", href: "/jobs", icon: BriefcaseBusinessIcon },
    { done: data.applications > 0, label: "Analyze your fit", detail: "Open the job and run the analysis to start an application.", href: "/jobs", icon: FileTextIcon },
  ]
  const setupDone = setup.filter((step) => step.done).length

  return (
    <>
      {setupDone < setup.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              {setupDone} of {setup.length} done
            </CardDescription>
            <CardAction className="w-32">
              <Progress value={(setupDone / setup.length) * 100} />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {setup.map((step) => (
              <div key={step.label} className="flex items-start gap-3 rounded-lg border p-4">
                {step.done ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" /> : <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <div className="grid flex-1 gap-1">
                  <div className="text-sm font-medium">{step.label}</div>
                  <p className="text-sm text-muted-foreground">{step.detail}</p>
                  {!step.done ? (
                    <Button size="sm" variant="outline" className="mt-2 w-fit" nativeButton={false} render={<Link href={step.href} />}>
                      Start <ArrowRightIcon />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data.applications ? <NeedsAttention items={data.attention} upcoming={data.upcoming} now={data.now} replies={data.replies} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Active applications" value={active} hint="Not closed, withdrawn or archived" href="/applications" />
        <Stat title="Ready to send" value={sum(["ready"])} hint="Passed every quality check" href="/applications" />
        <Stat title="Sent" value={sum(["submitted", "interviewing", "offer"])} hint={`${sum(["interviewing", "offer"])} in interviews`} href="/applications" />
        <Stat title="Verified facts" value={data.verifiedFacts} hint="What your documents can claim" href="/profile" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent applications</CardTitle>
            <CardDescription>Pick up where you left off.</CardDescription>
            <CardAction>
              <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/applications" />}>
                View all <ArrowRightIcon />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.recent.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Fit</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Updated</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent.map((application) => {
                    const score = displayFitScore(application.analysis as StoredAnalysis | null)
                    return (
                      <TableRow key={application.id}>
                        <TableCell>
                          <Link href={`/applications/${application.id}`} className="flex min-w-0 items-center gap-3">
                            <EntryLogo path={application.job.company?.logoPath} name={application.job.company?.name ?? "?"} size={32} />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{application.job.title}</div>
                              <div className="truncate text-xs text-muted-foreground">{application.job.company?.name}</div>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={application.status === "ready" ? "default" : "secondary"}>{STATUS_LABEL[application.status] ?? application.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <FitRing score={score} className="ml-auto" />
                        </TableCell>
                        <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{relative(application.updatedAt)}</TableCell>
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
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SendIcon />
                  </EmptyMedia>
                  <EmptyTitle>No applications yet</EmptyTitle>
                  <EmptyDescription>Add a job and analyze your fit to start one.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button nativeButton={false} render={<Link href="/jobs" />}>
                    <PlusIcon /> Add a job
                  </Button>
                </EmptyContent>
              </Empty>
            )}
          </CardContent>
        </Card>

        <div className="grid min-w-0 content-start gap-4">
          <LiveRefresh active every={busy ? 5000 : 20000} />
          <Card size="sm">
            <CardHeader>
              <CardTitle><h2>Pipeline</h2></CardTitle>
              <CardDescription>{active ? `${active} active application${active === 1 ? "" : "s"}` : "No active applications"}</CardDescription>
              <CardAction>
                <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/applications" />}>Board <ArrowRightIcon /></Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-2">
              {active > 0 ? <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
                {pipeline.filter((stage) => stage.count > 0).map((stage) => (
                  <span key={stage.id} className={STAGE_COLOR[stage.id]} style={{ flexGrow: stage.count, flexBasis: 0 }} />
                ))}
              </div> : null}
              <ul className="grid grid-cols-2 gap-x-2">
                {pipeline.map((stage) => (
                  <li key={stage.id}>
                    <Link href={`/applications?view=list&stage=${stage.id}`} className="flex min-h-8 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
                      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full ring-1 ring-foreground/20", STAGE_COLOR[stage.id])} />
                      <span className="min-w-0 flex-1">{stage.title}</span>
                      <span className="font-medium tabular-nums">{stage.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle><h2>Recent activity</h2></CardTitle>
              <CardAction><Button size="xs" variant="ghost" nativeButton={false} render={<Link href="/runs" />}>All runs <ArrowRightIcon /></Button></CardAction>
            </CardHeader>
            <CardContent>
              {data.recentRuns.length ? (
                <ul className="divide-y">
                  {data.recentRuns.slice(0, 3).map((run) => (
                    <li key={run.id}>
                      <Link href={`/runs/${run.id}`} className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
                        <WorkflowIcon workflow={run.workflow} className="size-7" />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="break-words text-sm font-medium">{workflowLabel(run.workflow)}</span>
                          {run.title ? <span className="truncate text-xs text-muted-foreground" title={run.title}>{run.title}</span> : null}
                        </span>
                          <span className="grid shrink-0 justify-items-end text-xs text-muted-foreground">
                            <span className={cn(run.status === "failed" && "font-medium text-destructive", run.status === "running" && "font-medium text-foreground")}>{RUN_STATUS[run.status]}</span>
                            <time dateTime={run.createdAt.toISOString()}>{ago(run.createdAt, data.now)}</time>
                          </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">Job imports, analyses, and document drafts will appear here.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function Stat({ title, value, hint, href }: { title: string; value: number; hint: string; href: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        <CardAction>
          <Button size="icon-sm" variant="ghost" aria-label={`Open ${title}`} nativeButton={false} render={<Link href={href} />}>
            <ArrowRightIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">{hint}</CardFooter>
    </Card>
  )
}
