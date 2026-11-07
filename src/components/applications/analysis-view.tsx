"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react"
import {
  AlertTriangleIcon,
  BotIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  InfoIcon,
  CircleDashedIcon,
  CircleHelpIcon,
  ShieldAlertIcon,
  XCircleIcon,
} from "lucide-react"
import { CompanyResearch } from "@/components/applications/company-research"
import { EntryLogo } from "@/components/profile/entry-logo"
import type { CompanyResearch as Research } from "@/server/research/brief"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { displayFitScore, type RequirementMatch } from "@/server/analysis/match"
import type { StoredAnalysis } from "@/server/applications/repository"

type FactRow = { id: string; statement: string; entryId: string; entryTitle: string; display: Record<string, { organization?: string; role?: string }>; logoPath: string | null }

const STATUS = {
  met: { label: "Proven", icon: CheckCircle2Icon, className: "text-emerald-600", pill: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400" },
  partial: { label: "Partly", icon: CircleDashedIcon, className: "text-amber-600", pill: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400" },
  gap: { label: "Not in profile", icon: XCircleIcon, className: "text-rose-600", pill: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400" },
  judgement: { label: "Your call", icon: CircleHelpIcon, className: "text-muted-foreground", pill: "border-border bg-muted/60 text-muted-foreground" },
} as const

const KIND_TITLE = { must: "Must-haves", responsibility: "What you'd do", nice: "Nice to have" } as const


function FitRing({ score }: { score: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  const tone = score >= 75 ? "stroke-emerald-500" : score >= 50 ? "stroke-amber-500" : "stroke-rose-500"
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={r} className="fill-none stroke-muted" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} className={cn("fill-none transition-[stroke-dashoffset] duration-500 ease-(--ease-out)", tone)} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-2xl font-semibold tabular-nums">{score}</span>
        <span className="-mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">fit</span>
      </div>
    </div>
  )
}

const EASE = [0.23, 1, 0.32, 1] as const

function Requirement({ match, facts }: { match: RequirementMatch; facts: FactRow[] }) {
  const status = STATUS[match.status]
  const evidence = match.factIds.map((id) => facts.find((fact) => fact.id === id)).filter(Boolean) as FactRow[]
  // What needs work opens by default; what's already proven stays one line until asked.
  const [open, setOpen] = useState(match.status !== "met")
  const reduce = useReducedMotion()
  const hasDetail = Boolean(evidence.length || match.covered.length || match.missing.length || match.note)
  return (
    <li className="border-b last:border-0">
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        aria-expanded={hasDetail ? open : undefined}
        className={cn("flex w-full items-start gap-3 rounded-md py-3 text-start", hasDetail && "-mx-2 px-2 transition-colors hover:bg-muted/40")}
      >
        <status.icon className={cn("mt-1 size-4 shrink-0", status.className)} aria-hidden />
        <span className="min-w-0 flex-1 text-sm leading-6">{match.text}</span>
        {!open && evidence.length ? <span className="mt-0.5 shrink-0 text-xs text-muted-foreground tabular-nums">{evidence.length} fact{evidence.length === 1 ? "" : "s"}</span> : null}
        <span className={cn("mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", status.pill)}>{status.label}</span>
        {hasDetail ? <ChevronDownIcon className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden /> : <span className="w-4 shrink-0" />}
      </button>
      <AnimatePresence initial={false}>
        {open && hasDetail ? (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="grid gap-1.5 ps-7 pb-3.5">
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
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  )
}

/** Proven / partly / missing / your call as one bar; each part filters the list below. */
function StatusBar({ counts, onPick }: { counts: Record<keyof typeof STATUS, number>; onPick: (filter: Filter) => void }) {
  const reduce = useReducedMotion()
  const keys = ["met", "partial", "gap", "judgement"] as const
  const total = keys.reduce((sum, key) => sum + counts[key], 0) || 1
  const fill = { met: "bg-emerald-500", partial: "bg-amber-400", gap: "bg-rose-500", judgement: "bg-muted-foreground/30" } as const
  return (
    <div className="grid gap-2">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
        {keys.map((key, index) =>
          counts[key] ? (
            <motion.span
              key={key}
              className={fill[key]}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${(counts[key] / total) * 100}%` }}
              transition={{ duration: 0.6, delay: index * 0.06, ease: EASE }}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {keys.map((key) => {
          const Icon = STATUS[key].icon
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key === "met" ? "proven" : "attention")}
              className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon className={cn("size-3.5", STATUS[key].className)} />
              <span className="font-medium text-foreground tabular-nums">{counts[key]}</span> {STATUS[key].label.toLowerCase()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Segmented control whose highlight slides to the chosen option. */
function FilterTabs({ value, onChange, options }: { value: Filter; onChange: (value: Filter) => void; options: { value: Filter; label: string; count: number }[] }) {
  return (
    <LayoutGroup id="requirement-filter">
      <div role="tablist" aria-label="Filter requirements" className="flex w-fit rounded-lg bg-muted p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn("relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors", value === option.value ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {value === option.value ? <motion.span layoutId="requirement-filter-pill" className="absolute inset-0 rounded-md bg-background shadow-xs" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} /> : null}
            <span className="relative inline-flex items-center gap-1.5">
              {option.label}
              <span className="text-muted-foreground tabular-nums">{option.count}</span>
            </span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

type Filter = "all" | "attention" | "proven"

export function AnalysisView({ analysis, facts, research }: { analysis: StoredAnalysis; facts: FactRow[]; research: { applicationId: string; jobId: string; company: string; language: string; initial: Research | null; researching?: boolean; logoPath?: string | null } }) {
  const counts = analysis.counts
  const needsWork = counts.partial + counts.gap + counts.judgement
  const [filter, setFilter] = useState<Filter>(needsWork && needsWork < analysis.requirements.length ? "attention" : "all")
  const pick = (next: Filter) => {
    setFilter(next)
    document.getElementById("requirements")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const groups = useMemo(() => {
    const visible = analysis.requirements.filter((match) =>
      filter === "attention" ? match.status === "partial" || match.status === "gap" || match.status === "judgement" : filter === "proven" ? match.status === "met" : true,
    )
    return (["must", "responsibility", "nice"] as const).map((kind) => ({ kind, items: visible.filter((match) => match.kind === kind) })).filter((group) => group.items.length)
  }, [analysis.requirements, filter])
  const score = displayFitScore(analysis)
  const reviewStatus = analysis.requirementFilter?.status
  const verdict = score === null ? "No score yet." : score >= 75 ? "Strong match: you can back up most of what they ask." : score >= 50 ? "Worth a shot, with a few gaps to be upfront about." : "A stretch for now. Go for it only if it really excites you."
  const method = analysis.modelReview
    ? `Rules, then a model review (${analysis.modelReview.reviewed} items checked, ${analysis.modelReview.changed} adjusted).`
    : reviewStatus === "empty" ? "AI review skipped: no requirements were extracted."
    : analysis.requirementFilter?.reviewed ? "AI sorted the posting items, then rules matched the evidence."
    : reviewStatus === "not_configured" ? "Rules only. Set up an AI model in Settings for a review."
    : "Rules only."

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="xl:col-start-1 xl:row-start-1">
          <CardContent className="flex flex-wrap items-center gap-5">
            {score === null ? <p className="shrink-0 text-sm font-medium">Fit not scored</p> : <FitRing score={score} />}
            <div className="grid min-w-0 flex-1 gap-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm">
                  <span className="font-medium">{verdict}</span>{" "}
                  <span className="text-muted-foreground">I checked it against your {analysis.factCount} verified facts.</span>
                </p>
                <Popover>
                  <PopoverTrigger render={<button type="button" className="inline-flex shrink-0 items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground" />}>
                    <InfoIcon className="size-3.5" /> How
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 text-xs text-muted-foreground">
                    <div className="grid gap-1.5">
                      <p>A requirement is only “proven” when a fact you verified shows it. Soft skills are left to your judgement and not scored.</p>
                      <p>{method}</p>
                      {analysis.requirementFilter ? <p>{analysis.requirementFilter.excluded.length} posting item(s) like benefits or interview steps were left out of the score.{analysis.requirementFilter.status === "failed" || analysis.requirementFilter.status === "partial" ? ` ${analysis.requirementFilter.message ?? "AI filtering was incomplete; remaining items use rule-based extraction."}` : ""}</p> : null}
                      <p>Analyzed {new Date(analysis.analyzedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.</p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <StatusBar counts={counts} onPick={pick} />
            </div>
          </CardContent>
        </Card>

      <aside className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:grid-cols-1">
        <Card className="gap-4">
          <CardHeader className="flex flex-row items-center gap-3">
            <EntryLogo path={research.logoPath ?? null} name={research.company} size={36} className="rounded-lg" />
            <div className="grid min-w-0 gap-0.5">
              <CardTitle className="truncate text-sm">Why {research.company}</CardTitle>
              <CardDescription className="text-xs">Talking points from their own pages</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <CompanyResearch {...research} />
          </CardContent>
        </Card>

        {analysis.mustGaps.length ? (
          <Card className="gap-3 overflow-hidden border-rose-200/70 bg-gradient-to-b from-rose-50/70 to-transparent dark:border-rose-900/60 dark:from-rose-950/30">
            <CardHeader className="flex flex-row items-start gap-3">
              <span className="grid size-9 shrink-0 place-content-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                <ShieldAlertIcon className="size-4.5" />
              </span>
              <div className="grid min-w-0 gap-0.5">
                <CardTitle className="flex items-center gap-2 text-sm">
                  Don’t claim these
                  <span className="rounded-full bg-rose-100 px-1.5 text-[11px] font-medium text-rose-700 tabular-nums dark:bg-rose-950 dark:text-rose-300">{analysis.mustGaps.length}</span>
                </CardTitle>
                <CardDescription className="text-xs">Not backed by your verified profile, so your CV and letter leave them out.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1.5">
                {analysis.mustGaps.map((gap) => (
                  <li key={gap} className="flex items-start gap-2 rounded-md bg-background/80 px-2.5 py-2 text-sm leading-5 ring-1 ring-rose-200/60 dark:ring-rose-900/50">
                    <XCircleIcon className="mt-0.5 size-3.5 shrink-0 text-rose-500" /> <span className="line-clamp-3">{gap}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-sm">Lead with these entries</CardTitle>
            <CardDescription className="text-xs">Put them first on your CV. Bars show how many requirements each one proves.</CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.recommendedEntries.length ? (
              <ol className="grid gap-0.5">
                {analysis.recommendedEntries.slice(0, 6).map((entry, index) => {
                  const logo = facts.find((fact) => fact.entryId === entry.entryId)?.logoPath ?? null
                  const top = analysis.recommendedEntries[0]?.requirements || 1
                  return (
                    <li key={entry.entryId}>
                      <Link href={`/profile/${entry.entryId}`} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted">
                        <EntryLogo path={logo} name={entry.title} size={28} className="rounded-md" />
                        <span className="grid min-w-0 flex-1 gap-1">
                          <span className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={entry.title}>{entry.title}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">{entry.requirements}</span>
                          </span>
                          <span className="h-1 overflow-hidden rounded-full bg-muted">
                            <motion.span
                              className={cn("block h-full rounded-full", index === 0 ? "bg-primary" : "bg-primary/40")}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.max((entry.requirements / top) * 100, 6)}%` }}
                              transition={{ duration: 0.5, delay: index * 0.05, ease: EASE }}
                            />
                          </span>
                        </span>
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

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-sm">Key skills in this posting</CardTitle>
            <CardDescription className="text-xs">Most mentioned first.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {analysis.keywords.length ? (
              ([
                ["You have", analysis.keywords.filter((keyword) => keyword.inProfile), true],
                ["Not in your profile", analysis.keywords.filter((keyword) => !keyword.inProfile), false],
              ] as const).map(([title, list, have]) =>
                list.length ? (
                  <div key={title} className="grid gap-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {have ? <CheckCircle2Icon className="size-3 text-emerald-600" /> : <AlertTriangleIcon className="size-3 text-amber-500" />}
                      {title} · {list.length}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((keyword) => (
                        <Badge key={keyword.key} variant={have ? "secondary" : "outline"} className={cn("gap-1 font-normal", !have && "border-dashed text-muted-foreground")}>
                          {keyword.key}
                          {keyword.count > 1 ? <span className="text-muted-foreground tabular-nums">×{keyword.count}</span> : null}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null,
              )
            ) : (
              <p className="text-sm text-muted-foreground">No known skills detected.</p>
            )}
          </CardContent>
        </Card>
      </aside>

        <Card id="requirements" className="scroll-mt-4 xl:col-start-1 xl:row-start-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>Requirements & evidence</CardTitle>
              <CardDescription>Each line shows the facts from your profile that back it.</CardDescription>
            </div>
            <FilterTabs
              value={filter}
              onChange={setFilter}
              options={[
                { value: "attention", label: "Needs attention", count: counts.partial + counts.gap + counts.judgement },
                { value: "proven", label: "Proven", count: counts.met },
                { value: "all", label: "All", count: analysis.requirements.length },
              ]}
            />
          </CardHeader>
          <CardContent className="grid gap-6">
            {groups.length ? (
              groups.map((group) => (
                <section key={group.kind}>
                  <h2 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {KIND_TITLE[group.kind]} · {group.items.length}
                  </h2>
                  <ul>
                    {group.items.map((match) => (
                      <Requirement key={match.id} match={match} facts={facts} />
                    ))}
                  </ul>
                </section>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {analysis.requirements.length ? "Nothing in this filter." : analysis.requirementFilter?.excluded.length ? "No candidate requirements remained after filtering. Inspect the excluded posting details below." : "No requirements were extracted. Check the imported job description and run the fit check again."}
              </p>
            )}
            {analysis.requirementFilter?.excluded.length ? <details className="border-t pt-4 text-sm">
              <summary className="cursor-pointer font-medium">Excluded posting details ({analysis.requirementFilter.excluded.length})</summary>
              <p className="mt-2 text-xs text-muted-foreground">Interview steps, benefits and company information are kept here for transparency. They are not treated as missing skills.</p>
              <ul className="mt-3 divide-y">
                {analysis.requirementFilter.excluded.map((item) => <li key={item.requirement.id} className="grid gap-1.5 py-3">
                  <p className="text-[13px] leading-6 [overflow-wrap:anywhere]">{item.requirement.text}</p>
                  <p className="text-xs text-muted-foreground">{item.source === "model" ? "AI" : "Rules"} · {item.category.replaceAll("_", " ")} · {item.reason}</p>
                </li>)}
              </ul>
            </details> : null}
          </CardContent>
        </Card>
    </div>
  )
}
