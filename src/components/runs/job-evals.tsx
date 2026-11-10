"use client"

import { useState, useTransition } from "react"
import { CheckCircle2Icon, Loader2Icon, PlayIcon, XCircleIcon } from "lucide-react"
import { runJobEvalsAction } from "@/app/[locale]/(app)/runs/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { EvalCase } from "@/server/evals/jobs"
import { useTranslations } from "next-intl"

export function JobEvals() {
  const [cases, setCases] = useState<EvalCase[] | null>(null)
  const [pending, startTransition] = useTransition()
  const passed = cases?.filter((item) => item.pass).length ?? 0
  const t = useTranslations("runs.evals")
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => setCases(await runJobEvalsAction()))}>
            {pending ? <Loader2Icon className="animate-spin" /> : <PlayIcon />} {t("run")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {cases ? (
          <div className="grid gap-4">
            <p className="text-sm">
              {t.rich("passing", { passed, total: cases.length, b: (chunks) => <span className="font-medium tabular-nums">{chunks}</span> })}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("case")}</TableHead>
                  <TableHead>{t("result")}</TableHead>
                  <TableHead>{t("failedChecks")}</TableHead>
                  <TableHead className="text-end">{t("time")}</TableHead>
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
                            <CheckCircle2Icon /> {t("pass")}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircleIcon /> {t("fail")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md whitespace-normal text-muted-foreground">
                        {failed.length ? failed.map((check) => t("mismatch", { name: check.name, expected: String(check.expected), actual: String(check.actual) })).join(" · ") : t("checks", { count: item.checks.length })}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{t("ms", { ms: item.ms })}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("notRun")}</p>
        )}
      </CardContent>
    </Card>
  )
}
