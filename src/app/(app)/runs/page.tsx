import Link from "next/link"
import { Suspense } from "react"
import { connection } from "next/server"
import { ChevronRightIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { RefreshRuns } from "@/components/refresh-runs"
import { JobEvals } from "@/components/runs/job-evals"
import { duration, workflowLabel } from "@/components/runs/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { documentQuality, listRuns, runStats, workflows } from "@/server/runs/repository"

export const metadata = { title: "Runs" }

type Search = Promise<Record<string, string | string[] | undefined>>
const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined)

export default function RunsPage({ searchParams }: PageProps<"/runs">) {
  return (
    <>
      <PageHeader
        title="Runs"
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
  return <Traces workflow={one(params.workflow)} status={one(params.status)} />
}

function filterHref(next: { workflow?: string; status?: string }) {
  const query = new URLSearchParams(Object.entries(next).filter(([, value]) => value) as [string, string][])
  const text = query.toString()
  return text ? `/runs?${text}` : "/runs"
}

async function Traces({ workflow, status }: { workflow?: string; status?: string }) {
  const [stats, rows, names] = await Promise.all([runStats(7), listRuns({ workflow, status }), workflows()])
  const failureRate = stats.total ? Math.round((stats.failed / stats.total) * 100) : 0
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Runs" value={String(stats.total)} hint="Last 7 days" />
        <Stat title="Failure rate" value={`${failureRate}%`} hint={`${stats.failed} failed`} />
        <Stat title="Median time" value={duration(stats.p50)} hint={`p95 ${duration(stats.p95)}`} />
        <Stat title="Model tokens" value={stats.tokens.toLocaleString()} hint="0 when no model is configured" />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant={!workflow ? "secondary" : "ghost"} nativeButton={false} render={<Link href={filterHref({ status })} />}>
          All workflows
        </Button>
        {names.map((name) => (
          <Button key={name} size="sm" variant={workflow === name ? "secondary" : "ghost"} nativeButton={false} render={<Link href={filterHref({ workflow: name, status })} />}>
            {workflowLabel(name)}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Button size="sm" variant={status === "failed" ? "secondary" : "ghost"} nativeButton={false} render={<Link href={filterHref({ workflow, status: status === "failed" ? undefined : "failed" })} />}>
          Failed only
        </Button>
      </div>

      {rows.length ? (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Workflow</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Steps</TableHead>
                <TableHead className="text-right">Time</TableHead>
                <TableHead className="hidden text-right md:table-cell">Tokens</TableHead>
                <TableHead className="text-right">Started</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="pl-4">
                    <Link href={`/runs/${run.id}`} className="font-medium hover:underline">
                      {workflowLabel(run.workflow)}
                    </Link>
                    {run.error ? <p className="max-w-md truncate text-xs text-destructive">{run.error}</p> : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{run.steps}</TableCell>
                  <TableCell className="text-right tabular-nums">{duration(run.durationMs)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{run.tokens ? run.tokens.toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{run.createdAt.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</TableCell>
                  <TableCell>
                    <Button size="icon-sm" variant="ghost" aria-label="Open trace" nativeButton={false} render={<Link href={`/runs/${run.id}`} />}>
                      <ChevronRightIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No runs</EmptyTitle>
            <EmptyDescription>{workflow || status ? "Nothing matches these filters." : "Import a job, analyze your fit or generate a document to see its trace here."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </>
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

function Stat({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">{hint}</CardFooter>
    </Card>
  )
}
