"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  AlertTriangleIcon,
  BotIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleHelpIcon,
  FileTextIcon,
  MailIcon,
  ShieldAlertIcon,
  SparklesIcon,
  XCircleIcon,
} from "lucide-react"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { RequirementMatch } from "@/server/analysis/match"
import type { StoredAnalysis } from "@/server/applications/repository"

type FactRow = { id: string; statement: string; entryId: string; entryTitle: string; display: Record<string, { organization?: string; role?: string }>; logoPath: string | null }

const STATUS = {
  met: { label: "Proven", icon: CheckCircle2Icon, className: "text-emerald-600", pill: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400" },
  partial: { label: "Partly", icon: CircleDashedIcon, className: "text-amber-600", pill: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400" },
  gap: { label: "Not in profile", icon: XCircleIcon, className: "text-rose-600", pill: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400" },
  judgement: { label: "Your call", icon: CircleHelpIcon, className: "text-muted-foreground", pill: "border-border bg-muted/60 text-muted-foreground" },
} as const

const KIND_TITLE = { must: "Must-haves", responsibility: "What you'd do", nice: "Nice to have" } as const

const COVER = {
  required: { label: "Cover letter required", tone: "text-rose-700" },
  optional: { label: "Cover letter optional", tone: "text-amber-700" },
  not_requested: { label: "No cover letter needed", tone: "text-muted-foreground" },
  not_mentioned: { label: "Cover letter not mentioned", tone: "text-muted-foreground" },
} as const

function FitRing({ score }: { score: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  const tone = score >= 75 ? "stroke-emerald-500" : score >= 50 ? "stroke-amber-500" : "stroke-rose-500"
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} className="fill-none stroke-muted" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} className={cn("fill-none transition-all", tone)} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-2xl font-semibold tabular-nums">{score}</span>
        <span className="-mt-1 text-[10px] tracking-wide text-muted-foreground uppercase">fit</span>
      </div>
    </div>
  )
}

function Requirement({ match, facts }: { match: RequirementMatch; facts: FactRow[] }) {
  const status = STATUS[match.status]
  const evidence = match.factIds.map((id) => facts.find((fact) => fact.id === id)).filter(Boolean) as FactRow[]
  return (
    <li className="grid gap-2 border-b py-3.5 last:border-0">
      <div className="flex items-start gap-3">
        <status.icon className={cn("mt-0.5 size-4 shrink-0", status.className)} aria-hidden />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-sm leading-6">{match.text}</p>
            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", status.pill)}>{status.label}</span>
          </div>
          {match.covered.length || match.missing.length ? (
            <div className="flex flex-wrap gap-1">
              {match.covered.map((key) => (
                <Badge key={`c-${key}`} variant="secondary" className="gap-1 font-normal">
                  <CheckCircle2Icon className="size-3 text-emerald-600" /> {key}
                </Badge>
              ))}
              {match.missing.map((key) => (
                <Badge key={`m-${key}`} variant="outline" className="gap-1 font-normal text-muted-foreground">
                  <XCircleIcon className="size-3 text-rose-500" /> {key}
                </Badge>
              ))}
            </div>
          ) : null}
          {evidence.length ? (
            <ul className="grid gap-1">
              {evidence.map((fact) => (
                <li key={fact.id} className="flex items-start gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
                  <EntryLogo path={fact.logoPath} name={fact.display.en?.organization || fact.entryTitle} size={18} className="mt-px rounded" />
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    <span className="font-medium text-foreground">{fact.display.en?.organization || fact.entryTitle}</span> — {fact.statement}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {match.note ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              {match.source === "model" ? (
                <Tooltip>
                  <TooltipTrigger render={<span />}>
                    <BotIcon className="mt-px size-3.5 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>Reviewed by the language model, limited to the facts shown</TooltipContent>
                </Tooltip>
              ) : null}
              {match.note}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}

type Filter = "all" | "attention" | "proven"

export function AnalysisView({ analysis, facts, cvHref }: { analysis: StoredAnalysis; facts: FactRow[]; cvHref: string }) {
  const [filter, setFilter] = useState<Filter>("all")
  const groups = useMemo(() => {
    const visible = analysis.requirements.filter((match) =>
      filter === "attention" ? match.status === "partial" || match.status === "gap" || match.status === "judgement" : filter === "proven" ? match.status === "met" : true,
    )
    return (["must", "responsibility", "nice"] as const).map((kind) => ({ kind, items: visible.filter((match) => match.kind === kind) })).filter((group) => group.items.length)
  }, [analysis.requirements, filter])
  const cover = COVER[analysis.coverLetter.decision as keyof typeof COVER] ?? COVER.not_mentioned
  const counts = analysis.counts

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 content-start gap-4">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-5">
            <FitRing score={analysis.fitScore} />
            <div className="grid min-w-0 flex-1 gap-2">
              <p className="text-sm text-muted-foreground">
                Based on <span className="font-medium text-foreground">{analysis.factCount} verified facts</span>. A requirement is only “proven” when a fact you verified shows it; soft skills are left to your judgement and not scored.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(["met", "partial", "gap", "judgement"] as const).map((key) => {
                  const Icon = STATUS[key].icon
                  return (
                    <span key={key} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs", STATUS[key].pill)}>
                      <Icon className="size-3" /> {counts[key]} {STATUS[key].label.toLowerCase()}
                    </span>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {analysis.modelReview ? (
                  <span className="inline-flex items-center gap-1">
                    <BotIcon className="size-3" /> Rules + model review ({analysis.modelReview.reviewed} items checked, {analysis.modelReview.changed} adjusted)
                  </span>
                ) : (
                  "Deterministic rules only — add an LLM key to get a second opinion on uncertain items."
                )}{" "}
                · analyzed {new Date(analysis.analyzedAt).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Requirements & evidence</CardTitle>
              <CardDescription>Each line shows the facts from your profile that back it.</CardDescription>
            </div>
            <ToggleGroup value={[filter]} onValueChange={(value) => value[0] && setFilter(value[0] as Filter)} variant="outline" size="sm">
              {(
                [
                  ["all", "All"],
                  ["attention", "Needs attention"],
                  ["proven", "Proven"],
                ] as const
              ).map(([value, label]) => (
                <ToggleGroupItem key={value} value={value} className="px-2.5 text-xs aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background">
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </CardHeader>
          <CardContent className="grid gap-6">
            {groups.length ? (
              groups.map((group) => (
                <section key={group.kind}>
                  <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {KIND_TITLE[group.kind]} · {group.items.length}
                  </h3>
                  <ul>
                    {group.items.map((match) => (
                      <Requirement key={match.id} match={match} facts={facts} />
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {analysis.requirements.length ? "Nothing in this filter." : "No requirement list found in this posting. Check the job description has bullet points under headings like “Requirements”."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <aside className="grid content-start gap-4">
        {analysis.mustGaps.length ? (
          <Card className="border-rose-200 dark:border-rose-900">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldAlertIcon className="size-4 text-rose-600" /> Don’t claim these
              </CardTitle>
              <CardDescription>Must-haves your verified profile doesn’t support. Generation will not mention them.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1.5 text-sm">
                {analysis.mustGaps.map((gap) => (
                  <li key={gap} className="flex items-start gap-2">
                    <XCircleIcon className="mt-0.5 size-3.5 shrink-0 text-rose-500" /> <span className="line-clamp-2">{gap}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lead with these entries</CardTitle>
            <CardDescription>Ranked by how many requirements they prove.</CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.recommendedEntries.length ? (
              <ol className="grid gap-1">
                {analysis.recommendedEntries.slice(0, 8).map((entry, index) => {
                  const logo = facts.find((fact) => fact.entryId === entry.entryId)?.logoPath ?? null
                  return (
                    <li key={entry.entryId}>
                      <Link href={`/profile/${entry.entryId}`} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted">
                        <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                        <EntryLogo path={logo} name={entry.title} size={24} className="rounded-md" />
                        <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{entry.requirements}</span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No entry proves a requirement yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Key skills in this posting</CardTitle>
            <CardDescription>Most mentioned first · ✓ appears in your verified profile.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {analysis.keywords.length ? (
              analysis.keywords.map((keyword) => (
                <Badge key={keyword.key} variant={keyword.inProfile ? "secondary" : "outline"} className={cn("gap-1 font-normal", !keyword.inProfile && "text-muted-foreground")}>
                  {keyword.inProfile ? <CheckCircle2Icon className="size-3 text-emerald-600" /> : <AlertTriangleIcon className="size-3 text-amber-500" />}
                  {keyword.key}
                  {keyword.count > 1 ? <span className="text-muted-foreground tabular-nums">×{keyword.count}</span> : null}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No known skills detected.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={cn("flex items-center gap-2 text-sm", cover.tone)}>
              <MailIcon className="size-4" /> {cover.label}
            </CardTitle>
            {analysis.coverLetter.evidence ? <CardDescription className="italic">“{analysis.coverLetter.evidence.slice(0, 220)}”</CardDescription> : null}
          </CardHeader>
        </Card>

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <SparklesIcon className="size-4" /> Your tailored CV
            </CardTitle>
            <CardDescription>Built only from your verified entries and approved bullets, ordered for this job, then quality-checked.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" nativeButton={false} render={<Link href={cvHref} />}>
              <FileTextIcon /> Open CV
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
