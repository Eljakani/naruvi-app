import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArrowLeftIcon, BotIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CircleDotIcon, FileImageIcon, ScaleIcon, type LucideIcon } from "lucide-react"
import { LiveRefresh } from "@/components/refresh-runs"
import { compact, duration, STEP_KIND_LABEL, stepKind, stepName, workflowLabel, type StepKind } from "@/components/runs/labels"
import { WorkflowIcon } from "@/components/runs/workflow-icon"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { getRun } from "@/server/runs/repository"

export const metadata = { title: "Trace" }

const KIND_ICON: Record<StepKind, LucideIcon> = { ai: BotIcon, decision: ScaleIcon, render: FileImageIcon, step: CircleDotIcon }
const KIND_BAR: Record<StepKind, string> = { ai: "bg-primary", decision: "bg-primary/55", render: "bg-foreground/30", step: "bg-foreground/20" }

export default function TracePage({ params }: PageProps<"/runs/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Trace params={params} />
    </Suspense>
  )
}

async function Trace({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const run = await getRun(id)
  if (!run) notFound()

  const start = (run.startedAt ?? run.createdAt).getTime()
  const end = run.finishedAt?.getTime() ?? Math.max(start + 1, run.now, ...run.steps.map((step) => step.createdAt.getTime() + (step.latencyMs ?? 0)))
  const span = Math.max(1, end - start)
  const tokensIn = run.steps.reduce((sum, step) => sum + (step.inputTokens ?? 0), 0)
  const tokensOut = run.steps.reduce((sum, step) => sum + (step.outputTokens ?? 0), 0)
  const steps = run.steps.map((step) => ({ ...step, kind: stepKind(step.name, step.model) }))
  const modelRequests = steps.filter((step) => step.model).length
  const failedSteps = steps.filter((step) => step.status === "failed").length
  const models = [...new Set(steps.map((step) => step.model).filter(Boolean))] as string[]
  const slowest = steps.reduce<(typeof steps)[number] | null>((best, step) => ((step.latencyMs ?? 0) > (best?.latencyMs ?? 0) ? step : best), null)
  const kinds = [...new Set(steps.map((step) => step.kind))]
  const running = run.status === "running" || run.status === "queued"

  return (
    <div className="grid gap-4">
      <LiveRefresh active={running} />
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/runs" />}>
          <ArrowLeftIcon /> Runs
        </Button>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={!run.newer} nativeButton={false} render={run.newer ? <Link href={`/runs/${run.newer}`} /> : <span />}>
            <ChevronLeftIcon /> Newer
          </Button>
          <Button variant="outline" size="sm" disabled={!run.older} nativeButton={false} render={run.older ? <Link href={`/runs/${run.older}`} /> : <span />}>
            Older <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <WorkflowIcon workflow={run.workflow} className="size-10" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{workflowLabel(run.workflow)}</h1>
            <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>{running ? "Running" : run.status === "failed" ? "Failed" : "Succeeded"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            <time dateTime={run.createdAt.toISOString()}>{run.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })}</time>
            {run.applicationId && run.job ? (
              <>
                {" · "}
                <Link href={`/applications/${run.applicationId}`} className="underline-offset-2 hover:underline">
                  {[run.job, run.company].filter(Boolean).join(" at ")}
                </Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {run.error ? (
        <Alert variant="destructive">
          <AlertTitle>The run failed</AlertTitle>
          <AlertDescription className="[overflow-wrap:anywhere]">{run.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="grid grid-cols-2 gap-0 divide-x divide-y py-0 sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5">
        <Fact label="Duration" value={running ? "running…" : duration(span)} />
        <Fact label="Steps" value={String(steps.length)} hint={failedSteps ? `${failedSteps} failed` : undefined} warn={failedSteps > 0} />
        <Fact label="Model requests" value={String(modelRequests)} />
        <Fact label="Tokens in / out" value={tokensIn + tokensOut ? `${compact(tokensIn)} / ${compact(tokensOut)}` : "—"} />
        <Fact label={models.length > 1 ? "Models" : "Model"} value={models.length ? models.join(", ") : "None"} small />
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b py-3">
          <div>
            <CardTitle className="text-sm">Steps</CardTitle>
            <CardDescription className="text-xs">Bars show when each step started and how long it took. Open a step for details.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {kinds.map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", KIND_BAR[kind])} /> {STEP_KIND_LABEL[kind]}
              </span>
            ))}
          </div>
        </CardHeader>
        <div className="hidden grid-cols-[minmax(0,18rem)_minmax(0,1fr)_4.5rem] gap-4 border-b px-4 py-1 text-[11px] text-muted-foreground tabular-nums md:grid">
          <span />
          <span className="flex justify-between">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{duration(span * f)}</span>)}
          </span>
          <span />
        </div>
        {steps.length ? (
          <ol className="divide-y">
            {steps.map((step, index) => {
              const Icon = KIND_ICON[step.kind]
              const left = Math.min(99, Math.max(0, ((step.createdAt.getTime() - start) / span) * 100))
              const width = Math.min(100 - left, Math.max(0.6, ((step.latencyMs ?? (step.status === "running" ? end - step.createdAt.getTime() : 0)) / span) * 100))
              const failed = step.status === "failed"
              const hasDetail = Boolean(step.detail || step.error || step.model)
              return (
                <li key={step.id}>
                  <details className="group/step" open={failed}>
                    <summary className={cn("grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-4 gap-y-1.5 px-4 py-2 hover:bg-muted/40 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_4.5rem] [&::-webkit-details-marker]:hidden", failed && "bg-destructive/5")}>
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                        <Icon className={cn("size-3.5 shrink-0", failed ? "text-destructive" : "text-muted-foreground")} aria-label={STEP_KIND_LABEL[step.kind]} />
                        <span className={cn("truncate", failed && "text-destructive")}>{stepName(step.name)}</span>
                        {slowest?.id === step.id && steps.length > 2 ? <Badge variant="outline" className="h-4 shrink-0 px-1 text-[11px] font-normal">slowest</Badge> : null}
                      </span>
                      <span className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto">
                        <span className="relative block h-3 rounded-sm bg-muted">
                          <span className={cn("absolute inset-y-0 rounded-sm", failed ? "bg-destructive" : KIND_BAR[step.kind], step.status === "running" && "animate-pulse")} style={{ left: `${left}%`, width: `${width}%` }} />
                        </span>
                      </span>
                      <span className="flex items-center justify-end gap-1 text-right text-xs tabular-nums md:col-start-3 md:row-start-1">
                        {step.status === "running" ? "…" : duration(step.latencyMs)}
                        {hasDetail ? <ChevronDownIcon className="size-3.5 text-muted-foreground transition-transform group-open/step:rotate-180" aria-hidden /> : <span className="w-3.5" />}
                      </span>
                    </summary>
                    {hasDetail ? (
                      <div className="grid gap-2 border-t bg-muted/20 px-4 py-3 pl-[3.25rem] text-xs">
                        {step.error ? <p className="text-destructive [overflow-wrap:anywhere]">{step.error}</p> : null}
                        {step.detail ? <p className="text-muted-foreground [overflow-wrap:anywhere]">{step.detail}</p> : null}
                        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                          <Meta label="Type" value={STEP_KIND_LABEL[step.kind]} />
                          {step.model ? <Meta label="Model" value={step.model} /> : null}
                          {step.inputTokens != null || step.outputTokens != null ? <Meta label="Tokens" value={`${(step.inputTokens ?? 0).toLocaleString()} in · ${(step.outputTokens ?? 0).toLocaleString()} out`} /> : null}
                          <Meta label="Started" value={`+${duration(step.createdAt.getTime() - start)}`} />
                        </dl>
                      </div>
                    ) : null}
                  </details>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">This run recorded no steps.</p>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">Traces keep operational metadata only: never prompts, model responses or your documents.</p>
    </div>
  )
}

function Fact({ label, value, hint, warn, small }: { label: string; value: string; hint?: string; warn?: boolean; small?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("truncate font-semibold tabular-nums", small ? "text-sm leading-7" : "text-lg")} title={value}>{value}</p>
      {hint ? <p className={cn("text-xs", warn ? "text-destructive" : "text-muted-foreground")}>{hint}</p> : null}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}
