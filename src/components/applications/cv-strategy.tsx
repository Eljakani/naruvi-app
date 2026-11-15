"use client"

import { useState } from "react"
import { ChevronRightIcon, CompassIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CvStrategy } from "@/server/documents/model"
import { useTranslations } from "next-intl"

type Coverage = { wanted: string[]; covered: string[]; hidden: string[]; missing: string[] }

const Chips = ({ values, className }: { values: string[]; className?: string }) => (
  <span className="flex flex-wrap gap-1">
    {values.map((value) => <span key={value} className={cn("rounded-md border px-1.5 py-0.5 text-[11px] leading-4", className)}>{value}</span>)}
  </span>
)

/**
 * Why the CV reads the way it does: the angle it takes for this job, the
 * selling points it leads with, what it cannot prove, and which of the job's
 * keywords it shows. Guidance only; none of this is printed.
 */
export function CvStrategyPanel({ strategy, coverage }: { strategy?: CvStrategy; coverage: Coverage | null }) {
  const t = useTranslations("cvStrategy")
  const [open, setOpen] = useState(true)
  const hasPlan = Boolean(strategy && (strategy.angle || strategy.strengths.length || strategy.gaps.length))
  const hasKeywords = Boolean(coverage && coverage.wanted.length >= 4)
  if (!hasPlan && !hasKeywords) return null
  return (
    <section className="rounded-lg border bg-card">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-start">
        <CompassIcon aria-hidden className="size-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 text-sm font-medium">{t("title")}</span>
        {hasKeywords ? <span className="text-xs text-muted-foreground tabular-nums">{t("keywordsCount", { covered: coverage!.covered.length, total: coverage!.wanted.length })}</span> : null}
        <ChevronRightIcon aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform rtl:rotate-180", open && "rotate-90 rtl:rotate-90")} />
      </button>
      {open ? (
        <div className="grid gap-3 border-t px-3 py-3 text-[13px] leading-5">
          {strategy?.angle ? <p className="text-pretty">{strategy.angle}</p> : null}
          {strategy?.strengths.length ? (
            <div className="grid gap-1">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("strengths")}</h4>
              <ol className="grid list-decimal gap-1 ps-4 marker:text-muted-foreground">
                {strategy.strengths.map((strength) => <li key={strength.text} className="text-pretty [overflow-wrap:anywhere]">{strength.text}</li>)}
              </ol>
            </div>
          ) : null}
          {strategy?.gaps.length ? (
            <div className="grid gap-1">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("gaps")}</h4>
              <ul className="grid list-disc gap-1 ps-4 marker:text-amber-500">
                {strategy.gaps.map((gap) => <li key={gap} className="[overflow-wrap:anywhere]">{gap}</li>)}
              </ul>
              <p className="text-xs text-muted-foreground">{t("gapsHint")}</p>
            </div>
          ) : null}
          {hasKeywords ? (
            <div className="grid gap-1.5">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("keywords")}</h4>
              {coverage!.covered.length ? <Chips values={coverage!.covered} className="border-emerald-600/25 bg-emerald-500/10" /> : null}
              {coverage!.hidden.length ? (
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{t("hidden")}</span>
                  <Chips values={coverage!.hidden} className="border-amber-500/40 bg-amber-500/10" />
                </div>
              ) : null}
              {coverage!.missing.length ? (
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{t("missing")}</span>
                  <Chips values={coverage!.missing} className="border-dashed text-muted-foreground" />
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">{t("savedNote")}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
