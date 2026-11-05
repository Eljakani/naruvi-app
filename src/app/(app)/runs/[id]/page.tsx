import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { connection } from "next/server"
import { ArrowLeftIcon } from "lucide-react"
import { duration, workflowLabel } from "@/components/runs/labels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getRun } from "@/server/runs/repository"

export const metadata = { title: "Trace" }

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
  const end = run.finishedAt?.getTime() ?? Math.max(start + 1, ...run.steps.map((step) => step.createdAt.getTime() + (step.latencyMs ?? 0)))
  const span = Math.max(1, end - start)
  const tokens = run.steps.reduce((sum, step) => sum + (step.inputTokens ?? 0) + (step.outputTokens ?? 0), 0)

  return (
    <div className="grid gap-4">
      <Button variant="ghost" size="sm" className="w-fit" nativeButton={false} render={<Link href="/runs" />}>
        <ArrowLeftIcon /> Runs
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{workflowLabel(run.workflow)}</h1>
        <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {run.createdAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })} · {duration(run.finishedAt ? span : null)} · {run.steps.length} steps{tokens ? ` · ${tokens.toLocaleString()} tokens` : ""}
        {run.application ? (
          <>
            {" · "}
            <Link href={`/applications/${run.application.id}`} className="hover:underline">
              {run.application.title}
            </Link>
          </>
        ) : null}
      </p>
      {run.error ? <p className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{run.error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <CardDescription>Each bar starts when the step started and spans its duration.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {run.steps.map((step) => {
            const left = ((step.createdAt.getTime() - start) / span) * 100
            const width = Math.max(0.8, ((step.latencyMs ?? 0) / span) * 100)
            return (
              <div key={step.id} className="grid gap-1 sm:grid-cols-[14rem_1fr] sm:items-center sm:gap-4">
                <div className="truncate text-sm">{step.name}</div>
                <div className="relative h-5 rounded bg-muted">
                  <div
                    className={step.status === "failed" ? "absolute inset-y-0 rounded bg-destructive" : "absolute inset-y-0 rounded bg-primary"}
                    style={{ left: `${Math.min(99, Math.max(0, left))}%`, width: `${Math.min(100 - Math.max(0, left), width)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Step</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Tokens in / out</TableHead>
              <TableHead className="pr-4 text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {run.steps.map((step) => (
              <TableRow key={step.id}>
                <TableCell className="max-w-xl min-w-64 pl-4 whitespace-normal">
                  <p className="font-medium">{step.name}</p>
                  {step.detail ? <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{step.detail}</p> : null}
                  {step.error ? <p className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">{step.error}</p> : null}
                </TableCell>
                <TableCell>
                  <Badge variant={step.status === "failed" ? "destructive" : "secondary"}>{step.status}</Badge>
                </TableCell>
                <TableCell>{step.model ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {step.inputTokens ?? "—"} / {step.outputTokens ?? "—"}
                </TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{duration(step.latencyMs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">Traces keep operational metadata only — never prompts, model responses or your documents.</p>
    </div>
  )
}
