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

export const metadata = { title: "Naruvi’s work" }

type Search = Promise<Record<string, string | string[] | undefined>>
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)

export default function RunsPage({ searchParams }: PageProps<"/runs">) {
  return (
    <>
      <PageHeader
        title="Naruvi’s work"
        description="Everything Naruvi did for you: what it read, checked and wrote, and how it went."
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
        Activity
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
  const groups = new Map<string, typeof rows>()
  for (const run of rows) groups.set(dayLabel(run.createdAt), [...(groups.get(dayLabel(run.createdAt)) ?? []), run])
  const rangeName = range === "all" ? "All time" : range === "24h" ? "Last 24 hours" : `Last ${RANGES[range]} days`
  const options = names.map((name) => ({ value: name, label: workflowLabel(name) }))
  const now = stats.now

  return (
    <>
      <LiveRefresh active={rows.some((run) => run.status === "running")} />
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border py-0 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] [&>*]:bg-card">
        <MiniStat className="col-span-2 sm:col-span-1" title="Tasks" value={stats.total.toLocaleString()} hint={rangeName}>
          <Spark daily={stats.daily} days={stats.days} now={now} />
        </MiniStat>
        <MiniStat title="Went well" value={successRate === null ? "—" : `${successRate}%`} hint={stats.failed ? `${stats.failed} failed${stats.running ? ` · ${stats.running} running` : ""}` : stats.running ? `${stats.running} running` : "Nothing failed"} tone={successRate !== null && successRate < 90 ? "warn" : undefined} />
        <MiniStat title="Usual time" value={duration(stats.p50)} hint={`Almost all under ${duration(stats.p95)}`} />
        <MiniStat className="col-span-2 sm:col-span-1" title="AI usage" value={compact(stats.tokens)} hint={stats.aiCalls ? `tokens · ${stats.aiCalls.toLocaleString()} requests` : "No AI requests"} />
      </Card>

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
                  <h2 className="sticky top-0 z-10 border-b bg-background/90 px-4 pt-3 pb-1.5 text-xs font-medium text-muted-foreground backdrop-blur">{day}</h2>
                  <ul className="divide-y">
                    {runs.map((run) => (
                      <li key={run.id}>
                        <Link href={`/runs/${run.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                          <WorkflowIcon workflow={run.workflow} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{workflowLabel(run.workflow)}</span>
                              <StatusMark status={run.status} />
                            </div>
                            <p className={cn("truncate text-xs", run.error ? "text-destructive" : "text-muted-foreground")}>
                              {run.error ?? ([run.job, run.company].filter(Boolean).join(" · ") || (run.aiCalls ? `${run.aiCalls} AI ${run.aiCalls === 1 ? "request" : "requests"}` : `${run.steps} ${run.steps === 1 ? "step" : "steps"}`))}
                            </p>
                          </div>
                          <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:block" title={run.models.length ? `${run.models.join(", ")}${run.tokens ? ` · ${compact(run.tokens)} tokens` : ""}` : undefined}>
                            {run.status === "running" ? "running…" : duration(run.durationMs)}
                          </span>
                          <time dateTime={run.createdAt.toISOString()} title={run.createdAt.toLocaleString()} className="w-16 shrink-0 text-right text-xs whitespace-nowrap text-muted-foreground">{ago(run.createdAt, now)}</time>
                          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,translate] group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100" />
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
                <EmptyTitle>Nothing here yet</EmptyTitle>
                <EmptyDescription>{workflow || status || range !== "all" ? "Nothing matches these filters. Try a longer time range." : "Add a job, check your fit or draft a document, and you’ll see what Naruvi did here."}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </Card>

        <Card className="h-fit gap-0 py-0 xl:sticky xl:top-4">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-sm">By task</CardTitle>
            <CardDescription className="text-xs">{rangeName}. Pick one to filter.</CardDescription>
          </CardHeader>
          <ul className="divide-y">
            {stats.byWorkflow.map((row) => {
              const active = workflow === row.workflow
              return (
                <li key={row.workflow}>
                  <Link href={href({ workflow: active ? undefined : row.workflow, status, range: range === "7d" ? undefined : range })} aria-current={active || undefined} className={cn("flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/40", active && "bg-muted")}>
                    <span className="min-w-0 flex-1 truncate">{workflowLabel(row.workflow)}</span>
                    {row.failed ? <span className="size-1.5 shrink-0 rounded-full bg-destructive" title={`${row.failed} failed`} aria-label={`${row.failed} failed`} /> : null}
                    <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{duration(row.p50)}</span>
                    <span className="w-8 text-right font-medium tabular-nums">{row.total}</span>
                  </Link>
                </li>
              )
            })}
            {!stats.byWorkflow.length ? <li className="px-4 py-3 text-sm text-muted-foreground">No runs in this period.</li> : null}
          </ul>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">Usual time · count</p>
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
    <div className="flex h-7 items-end gap-0.5" aria-hidden>
      {series.map((point) => (
        <div key={point.key} title={`${point.date.toLocaleDateString()}: ${point.total} runs${point.failed ? `, ${point.failed} failed` : ""}`} className="flex flex-1 flex-col justify-end overflow-hidden rounded-[2px] bg-muted/60" style={{ height: "100%" }}>
          <div className="bg-destructive" style={{ height: `${(point.failed / max) * 100}%` }} />
          <div className="bg-brand/70" style={{ height: `${((point.total - point.failed) / max) * 100}%` }} />
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

function MiniStat({ title, value, hint, tone, children, className }: { className?: string; title: string; value: string; hint: string; tone?: "warn"; children?: React.ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1 p-4", className)}>
      <span className="text-xs text-muted-foreground">{title}</span>
      <div className="flex items-end justify-between gap-3">
        <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", tone === "warn" && "text-destructive")}>{value}</span>
        {children ? <div className="w-28 max-w-[50%]">{children}</div> : null}
      </div>
      <span className="text-xs text-pretty text-muted-foreground">{hint}</span>
    </div>
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
