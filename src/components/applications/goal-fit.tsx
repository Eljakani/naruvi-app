import Link from "next/link"
import { CheckCircle2Icon, CircleHelpIcon, CompassIcon, XCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CheckStatus, GoalFit } from "@/lib/search-goals"
import { useLocale, useTranslations } from "next-intl"
import { goalCheckText } from "@/lib/goal-text"

const LOOK: Record<CheckStatus, { icon: typeof CheckCircle2Icon; className: string; frame: string }> = {
  ok: { icon: CheckCircle2Icon, className: "text-emerald-600", frame: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" },
  check: { icon: CircleHelpIcon, className: "text-amber-600", frame: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20" },
  blocked: { icon: XCircleIcon, className: "text-rose-600", frame: "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20" },
}

/** The job against the person's search goals: shown before any skills score. */
export function GoalFitNote({ fit }: { fit: GoalFit | null }) {
  const t = useTranslations("goals")
  const locale = useLocale()
  if (!fit) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <CompassIcon className="size-4" /> {t("intro")}
        <Link href="/profile" className="font-medium text-foreground underline-offset-4 hover:underline">{t("set")}</Link>
      </p>
    )
  }
  const look = LOOK[fit.verdict]
  const title = fit.verdict === "ok" ? t("fits", { goal: fit.goal.name }) : fit.verdict === "blocked" ? t("doesntFit", { goal: fit.goal.name }) : fit.implicit ? t("checkWhere") : t("checkAgainst", { goal: fit.goal.name })
  const shown = fit.verdict === "ok" ? fit.checks : fit.checks.filter((item) => item.status !== "ok")
  return (
    <section aria-label={t("label")} className={cn("grid gap-1.5 rounded-lg border px-3.5 py-2.5", look.frame)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium"><look.icon className={cn("size-4", look.className)} /> {title}</p>
        <Link href="/profile" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{fit.implicit ? t("set") : t("edit")}</Link>
      </div>
      <ul className="grid gap-1 text-sm">
        {shown.map((item) => {
          const Icon = LOOK[item.status].icon
          return <li key={item.kind} className="flex items-start gap-2"><Icon className={cn("mt-0.5 size-3.5 shrink-0", LOOK[item.status].className)} /> {goalCheckText(item, t, locale)}</li>
        })}
      </ul>
      {fit.implicit ? <p className="text-xs text-muted-foreground">{t("implicitHint")}</p> : null}
    </section>
  )
}

/** Compact goal verdict for list rows; the checks that need a look are in the tooltip text. */
export function GoalFitBadge({ fit }: { fit: GoalFit | null }) {
  const t = useTranslations("goals")
  const locale = useLocale()
  if (!fit || (fit.implicit && fit.verdict === "ok")) return null
  const look = LOOK[fit.verdict]
  const label = fit.implicit ? t("badge.location") : fit.verdict === "ok" ? t("badge.fits") : fit.verdict === "blocked" ? t("badge.off") : t("badge.check")
  const why = (fit.verdict === "ok" ? fit.checks : fit.checks.filter((item) => item.status !== "ok")).map((item) => goalCheckText(item, t, locale)).join("\n")
  return (
    <span title={`${fit.goal.name}\n${why}`} className={cn("inline-flex items-center gap-1 font-medium", look.className)}>
      <look.icon className="size-3.5" /> {label}
    </span>
  )
}
