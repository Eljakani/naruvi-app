import Link from "next/link"
import { Suspense } from "react"
import { ArrowRightIcon, BriefcaseBusinessIcon, CheckCircle2Icon, ChevronRightIcon, CircleIcon, FileTextIcon, PlusIcon, SendIcon, UserRoundCheckIcon } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { StoredAnalysis } from "@/server/applications/repository"
import { getDashboard } from "@/server/queries/dashboard"

export const metadata = { title: "Dashboard" }

const STAGES = [
  { label: "Preparing", keys: ["draft", "parsed", "analyzed"] },
  { label: "Documents ready", keys: ["generated", "ready"] },
  { label: "Sent", keys: ["submitted"] },
  { label: "Interviewing", keys: ["interviewing", "offer"] },
] as const

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

const WORKFLOW_LABEL: Record<string, string> = {
  "application.analyze": "Fit analysis",
  "company.research": "Company research",
  "cv.generate": "CV generated",
  "letter.generate": "Cover letter generated",
  "job.preview": "Job read",
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
  const active = sum(["draft", "parsed", "analyzed", "generated", "ready", "submitted", "interviewing", "offer"])

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Active applications" value={active} hint="Not closed or withdrawn" href="/applications" />
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
                    const score = (application.analysis as StoredAnalysis | null)?.fitScore
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
                        <TableCell className="text-right tabular-nums">{score ?? "—"}</TableCell>
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

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>{active} active</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {STAGES.map((stage) => {
                const n = sum(stage.keys)
                return (
                  <div key={stage.label} className="grid gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span>{stage.label}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </div>
                    <Progress value={active ? (n / active) * 100 : 0} />
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentRuns.length ? (
                <ul className="grid gap-3">
                  {data.recentRuns.map((run) => (
                    <li key={run.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{WORKFLOW_LABEL[run.workflow] ?? run.workflow}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {run.status === "failed" ? <Badge variant="destructive">Failed</Badge> : null}
                        <span className="text-muted-foreground">{relative(run.createdAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing yet.</p>
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
