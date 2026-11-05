"use client"

import { useState, useTransition } from "react"
import { CheckCircle2Icon, Loader2Icon, PlayIcon, XCircleIcon } from "lucide-react"
import { runJobEvalsAction } from "@/app/(app)/runs/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { EvalCase } from "@/server/evals/jobs"

export function JobEvals() {
  const [cases, setCases] = useState<EvalCase[] | null>(null)
  const [pending, startTransition] = useTransition()
  const passed = cases?.filter((item) => item.pass).length ?? 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Job import evals</CardTitle>
        <CardDescription>Captured postings with checked answers. Runs offline against the current parser; the same cases run in npm test.</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => setCases(await runJobEvalsAction()))}>
            {pending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />} Run
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {cases ? (
          <div className="grid gap-4">
            <p className="text-sm">
              <span className="font-medium tabular-nums">
                {passed}/{cases.length}
              </span>{" "}
              cases pass
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Failed checks</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((item) => {
                  const failed = item.checks.filter((check) => !check.pass)
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.id}</TableCell>
                      <TableCell>
                        {item.pass ? (
                          <Badge variant="secondary">
                            <CheckCircle2Icon /> Pass
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircleIcon /> Fail
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md whitespace-normal text-muted-foreground">
                        {failed.length ? failed.map((check) => `${check.name}: expected ${check.expected}, got ${check.actual}`).join(" · ") : `${item.checks.length} checks`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.ms} ms</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not run yet in this session.</p>
        )}
      </CardContent>
    </Card>
  )
}
