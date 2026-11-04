import Link from "next/link"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowRightIcon,
  BriefcaseBusinessIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  DatabaseIcon,
  FileCheck2Icon,
  FileTextIcon,
  SparklesIcon,
  UserRoundCheckIcon,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getDashboard } from "@/server/queries/dashboard"

export const metadata = { title: "Dashboard" }

const PIPELINE = [
  { key: "draft", label: "Draft" },
  { key: "parsed", label: "Parsed" },
  { key: "analyzed", label: "Analyzed" },
  { key: "generated", label: "Generated" },
  { key: "ready", label: "Ready" },
  { key: "submitted", label: "Submitted" },
  { key: "interviewing", label: "Interviewing" },
] as const

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your applications, from posting to a verified, ready-to-send CV."
        actions={
          <Button nativeButton={false} render={<Link href="/jobs" />}>
            <SparklesIcon /> New application
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
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )
}

async function DashboardData() {
  const data = await getDashboard()
  const ready = data.statusCounts.ready ?? 0
  const setup = [
    { done: true, label: "Database connected", detail: data.health.db, icon: DatabaseIcon },
    {
      done: Boolean(data.health.llm),
      label: "Language model configured",
      detail: data.health.llm ?? "Set LLM_API_KEY in .env.local (any OpenAI-compatible endpoint).",
      icon: SparklesIcon,
    },
    {
      done: data.hasProfile && data.verifiedFacts > 0,
      label: "Profile with verified facts",
      detail: data.verifiedFacts ? `${data.verifiedFacts} verified facts` : "Every generated claim will cite these facts.",
      icon: UserRoundCheckIcon,
      href: "/profile",
    },
    { done: data.jobs > 0, label: "First job imported", detail: "Paste any job link or description.", icon: BriefcaseBusinessIcon, href: "/jobs" },
  ]
  const setupDone = setup.filter((step) => step.done).length

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Applications" value={data.applications} hint="All stages" icon={FileTextIcon} />
        <StatCard title="Ready to send" value={ready} hint="Score ≥ 90, zero hard errors" icon={FileCheck2Icon} />
        <StatCard title="Jobs" value={data.jobs} hint="Parsed postings" icon={BriefcaseBusinessIcon} />
        <StatCard title="Verified facts" value={data.verifiedFacts} hint="Grounding for every claim" icon={UserRoundCheckIcon} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
            <CardDescription>Each stage is a guarded workflow step; nothing skips the quality gate.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {PIPELINE.map((stage, index) => {
                const n = data.statusCounts[stage.key] ?? 0
                return (
                  <li key={stage.key} className="rounded-lg border bg-muted/30 p-3">
                    <div className="text-xs text-muted-foreground">
                      {index + 1}. {stage.label}
                    </div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{n}</div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Get set up</CardTitle>
            <CardDescription>
              {setupDone}/{setup.length} done
            </CardDescription>
            <CardAction>
              <Badge variant={setupDone === setup.length ? "default" : "secondary"}>
                {Math.round((setupDone / setup.length) * 100)}%
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={(setupDone / setup.length) * 100} />
            <ul className="space-y-3">
              {setup.map((step) => (
                <li key={step.label} className="flex items-start gap-3">
                  {step.done ? (
                    <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{step.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{step.detail}</div>
                  </div>
                  {!step.done && step.href ? (
                    <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={step.href} />}>
                      Open <ArrowRightIcon />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Every agent step is traced: model, prompt version, tokens, decision.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentRuns.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{run.workflow}</TableCell>
                    <TableCell>
                      <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{run.createdAt.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <SparklesIcon className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No runs yet</p>
              <p className="text-xs text-muted-foreground">Import a job to start your first guarded workflow.</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">Traces live in Postgres alongside your data.</CardFooter>
      </Card>
    </>
  )
}

function StatCard({ title, value, hint, icon: Icon }: { title: string; value: number; hint: string; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
        <CardAction>
          <Icon className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardFooter className="text-xs text-muted-foreground">{hint}</CardFooter>
    </Card>
  )
}
