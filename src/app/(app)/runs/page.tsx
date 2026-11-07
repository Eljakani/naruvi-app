import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { ChevronRightIcon, LoaderCircleIcon, XIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { LiveRefresh, RefreshRuns } from "@/components/refresh-runs"
import { JobEvals } from "@/components/runs/job-evals"
import { ago, compact, duration, workflowLabel } from "@/components/runs/labels"
import { RunFilters } from "@/components/runs/run-filters"
import { WorkflowIcon } from "@/components/runs/workflow-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { documentQuality, isRange, listRuns, RANGES, runStats, workflows, type Range } from "@/server/runs/repository"

export const metadata = { title: "AI activity" }

type Search = Promise<Record<string, string | string[] | undefined>>
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)

export default function RunsPage({ searchParams }: PageProps<"/runs">) {
  return (
    <>
      <PageHeader
        title="AI activity"
        description="What every workflow did, how long it took, and how good the output is."
        actions={
          <Suspense fallback={null}>
            <TabSwitch searchParams={searchParams} />
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function TabSwitch({ searchParams }: { searchParams: Search }) {
  const tab = one((await searchParams).tab) === "quality" ? "quality" : "traces"
  return (
    <div className="flex gap-1">
      <Button size="sm" variant={tab === "traces" ? "secondary" : "ghost"} nativeButton={false} render={<Link href="/runs" />}>
        Traces
      </Button>
      <Button size="sm" variant={tab === "quality" ? "secondary" : "ghost"} nativeButton={false} render={<Link href="/runs?tab=quality" />}>
        Quality
      </Button>
      <RefreshRuns />
    </div>
  )
}

async function Content({ searchParams }: { searchParams: Search }) {
  await connection()
  const params = await searchParams
  if (one(params.tab) === "quality") return <Quality />
  const range = isRange(one(params.range)) ? (one(params.range) as Range) : "7d"
  const beforeText = one(params.before)
  const before = beforeText && !Number.isNaN(Date.parse(beforeText)) ? new Date(beforeText) : undefined
  return <Traces workflow={one(params.workflow)} status={one(params.status)} range={range} before={before} />
}

function href(params: Record<string, string | undefined>) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value) as [string, string][]).toString()
  return query ? `/runs?${query}` : "/runs"
}

function dayLabel(date: Date) {
  const today = new Date()
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((start(today) - start(date)) / 86_400_000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
}

async function Traces({ workflow, status, range, before }: { workflow?: string; status?: string; range: Range; before?: Date }) {
  const [stats, list, names] = await Promise.all([runStats({ workflow, range }), listRuns({ workflow, status, range, before }), workflows()])
  const rows = list.runs
  const successRate = stats.total ? Math.round(((stats.total - stats.failed - stats.running) / stats.total) * 100) : null
  const slowest = Math.max(1, ...rows.map((run) => run.durationMs ?? 0))
  const groups = new Map<string, typeof rows>()
  for (const run of rows) groups.set(dayLabel(run.createdAt), [...(groups.get(dayLabel(run.createdAt)) ?? []), run])
  const rangeName = range === "all" ? "All time" : range === "24h" ? "Last 24 hours" : `Last ${RANGES[range]} days`
  const options = names.map((name) => ({ value: name, label: workflowLabel(name) }))
  const now = stats.now

  return (
    <>
      <LiveRefresh active={rows.some((run) => run.status === "running")} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat title="Runs" value={stats.total.toLocaleString()} hint={rangeName}>
          <Spark daily={stats.daily} days={stats.days} now={now} />
        </Stat>
        <Stat title="Success rate" value={successRate === null ? "—" : `${successRate}%`} hint={stats.failed ? `${stats.failed} failed${stats.running ? ` · ${stats.running} running` : ""}` : stats.running ? `${stats.running} running` : "No failures"} tone={successRate !== null && successRate < 90 ? "warn" : undefined} />
        <Stat title="Median time" value={duration(stats.p50)} hint={`95% finish within ${duration(stats.p95)}`} />
        <Stat title="AI usage" value={compact(stats.tokens)} hint={stats.aiCalls ? `tokens · ${stats.aiCalls.toLocaleString()} model requests` : "No model requests"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="gap-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
            <RunFilters workflows={options} range={range} workflow={workflow} status={status} />
            {workflow || status ? (
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href({ range: range === "7d" ? undefined : range })} />}>
                <XIcon /> Clear filters
              </Button>
            ) : null}
          </div>
          {rows.length ? (
            <div>
              {[...groups.entries()].map(([day, runs]) => (
                <section key={day} aria-label={day}>
                  <h2 className="sticky top-0 z-10 border-b bg-muted/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">{day}</h2>
                  <ul className="divide-y">
                    {runs.map((run) => (
                      <li key={run.id}>
                        <Link href={`/runs/${run.id}`} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none md:grid-cols-[auto_minmax(0,1fr)_9rem_5rem_5.5rem_auto]">
                          <WorkflowIcon workflow={run.workflow} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{workflowLabel(run.workflow)}</span>
                              <StatusMark status={run.status} />
                            </div>
                            <p className={cn("truncate text-xs", run.error ? "text-destructive" : "text-muted-foreground")}>
                              {run.error ?? ([run.job, run.company].filter(Boolean).join(" · ") || `${run.steps} steps${run.aiCalls ? ` · ${run.aiCalls} model requests` : ""}`)}
                            </p>
                          </div>
                          <div className="hidden min-w-0 md:block">
                            {run.models.length ? (
                              <span className="flex min-w-0 items-center gap-1">
                                <Badge variant="outline" className="max-w-32 truncate font-normal">{run.models[0]}</Badge>
                                {run.models.length > 1 ? <span className="text-xs text-muted-foreground">+{run.models.length - 1}</span> : null}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">No model</span>}
                          </div>
                          <div className="hidden text-right text-xs text-muted-foreground tabular-nums md:block">{run.tokens ? compact(run.tokens) : "—"}</div>
                          <div className="hidden md:block">
                            <div className="text-right text-xs tabular-nums">{run.status === "running" ? "running…" : duration(run.durationMs)}</div>
                            <div className="mt-1 h-1 rounded-full bg-muted">
                              <div className={cn("h-1 rounded-full", run.status === "failed" ? "bg-destructive" : "bg-foreground/40")} style={{ width: `${Math.max(3, ((run.durationMs ?? 0) / slowest) * 100)}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
                            <time dateTime={run.createdAt.toISOString()} title={run.createdAt.toLocaleString()}>{ago(run.createdAt, now)}</time>
                            <ChevronRightIcon className="size-4 opacity-40 group-hover:opacity-100" />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {list.more || before ? (
                <div className="flex justify-between gap-2 border-t p-3">
                  {before ? <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href({ workflow, status, range: range === "7d" ? undefined : range })} />}>Newest</Button> : <span />}
                  {list.more ? (
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href={href({ workflow, status, range: range === "7d" ? undefined : range, before: rows.at(-1)!.createdAt.toISOString() })} />}>
                      Older runs <ChevronRightIcon />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <Empty className="m-3 border">
              <EmptyHeader>
                <EmptyTitle>No runs</EmptyTitle>
                <EmptyDescription>{workflow || status || range !== "all" ? "Nothing matches these filters. Try a longer time range." : "Add a job, check your fit or draft a document to see its trace here."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </Card>

        <Card className="h-fit gap-0 py-0 xl:sticky xl:top-4">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">By workflow</CardTitle>
            <CardDescription className="text-xs">{rangeName}. Pick one to filter.</CardDescription>
          </CardHeader>
          <ul className="divide-y">
            {stats.byWorkflow.map((row) => {
              const active = workflow === row.workflow
              return (
                <li key={row.workflow}>
                  <Link href={href({ workflow: active ? undefined : row.workflow, status, range: range === "7d" ? undefined : range })} aria-current={active || undefined} className={cn("flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/40", active && "bg-muted")}>
                    <span className="min-w-0 flex-1 truncate">{workflowLabel(row.workflow)}</span>
                    {row.failed ? <span className="text-xs text-destructive tabular-nums">{row.failed} failed</span> : null}
                    <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{duration(row.p50)}</span>
                    <span className="w-8 text-right font-medium tabular-nums">{row.total}</span>
                  </Link>
                </li>
              )
            })}
            {!stats.byWorkflow.length ? <li className="px-4 py-3 text-sm text-muted-foreground">No runs in this period.</li> : null}
          </ul>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">Median time · runs</p>
        </Card>
      </div>
    </>
  )
}

function StatusMark({ status }: { status: string }) {
  if (status === "failed") return <Badge variant="destructive" className="h-5">Failed</Badge>
  if (status === "running" || status === "queued") return <Badge variant="secondary" className="h-5"><LoaderCircleIcon className="animate-spin" /> Running</Badge>
  return null
}

/** Runs per day; failed runs in red. */
function Spark({ daily, days, now }: { daily: { day: string; total: number; failed: number }[]; days: number; now: number }) {
  const byDay = new Map(daily.map((row) => [row.day, row]))
  const series = Array.from({ length: Math.min(days, 30) }, (_, i) => {
    const date = new Date(now - (Math.min(days, 30) - 1 - i) * 86_400_000)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    return { key, date, ...(byDay.get(key) ?? { total: 0, failed: 0 }) }
  })
  const max = Math.max(1, ...series.map((point) => point.total))
  return (
    <div className="flex h-8 items-end gap-px" aria-hidden>
      {series.map((point) => (
        <div key={point.key} title={`${point.date.toLocaleDateString()}: ${point.total} runs${point.failed ? `, ${point.failed} failed` : ""}`} className="flex flex-1 flex-col justify-end overflow-hidden rounded-[2px] bg-muted" style={{ height: "100%" }}>
          <div className="bg-destructive" style={{ height: `${(point.failed / max) * 100}%` }} />
          <div className="bg-foreground/35" style={{ height: `${((point.total - point.failed) / max) * 100}%` }} />
        </div>
      ))}
    </div>
  )
}

async function Quality() {
  const quality = await documentQuality()
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat title="Documents checked" value={String(quality.documents)} hint="Latest version of each CV and letter" />
        <Stat title="Average score" value={quality.average === null ? "—" : String(quality.average)} hint="Quality gate score, 0–100" />
        <Stat title="No hard errors" value={quality.documents ? `${Math.round((quality.clean / quality.documents) * 100)}%` : "—"} hint={`${quality.clean} of ${quality.documents}`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Quality checks</CardTitle>
          <CardDescription>How often each check fails or warns on your latest documents. The ones at the top are where generation needs work.</CardDescription>
        </CardHeader>
        <CardContent>
          {quality.checks.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Check</TableHead>
                  <TableHead className="w-48">Passing</TableHead>
                  <TableHead className="text-right">Warn</TableHead>
                  <TableHead className="text-right">Fail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quality.checks.map((check) => {
                  const passing = check.total ? ((check.total - check.fail - check.warn) / check.total) * 100 : 0
                  return (
                    <TableRow key={check.id}>
                      <TableCell>{check.label}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={passing} className="w-28" />
                          <span className="text-xs text-muted-foreground tabular-nums">{Math.round(passing)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{check.warn}</TableCell>
                      <TableCell className="text-right tabular-nums">{check.fail}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Generate a CV or cover letter to see quality data.</p>
          )}
        </CardContent>
      </Card>
      <JobEvals />
    </>
  )
}

function Stat({ title, value, hint, tone, children }: { title: string; value: string; hint: string; tone?: "warn"; children?: React.ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className={cn("text-3xl tabular-nums", tone === "warn" && "text-destructive")}>{value}</CardTitle>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      <CardFooter className="mt-auto text-sm text-muted-foreground">{hint}</CardFooter>
    </Card>
  )
}
