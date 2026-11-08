import Link from "next/link"
import { CheckCircle2Icon, CircleHelpIcon, CompassIcon, XCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CheckStatus, GoalFit } from "@/lib/search-goals"

const LOOK: Record<CheckStatus, { icon: typeof CheckCircle2Icon; className: string; frame: string }> = {
  ok: { icon: CheckCircle2Icon, className: "text-emerald-600", frame: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20" },
  check: { icon: CircleHelpIcon, className: "text-amber-600", frame: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20" },
  blocked: { icon: XCircleIcon, className: "text-rose-600", frame: "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20" },
}

/** The job against the person's search goals: shown before any skills score. */
export function GoalFitNote({ fit }: { fit: GoalFit | null }) {
  if (!fit) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <CompassIcon className="size-4" /> Tell Naruvi what you’re looking for (contract, places, work rights) and each job gets checked against it.
        <Link href="/profile" className="font-medium text-foreground underline-offset-4 hover:underline">Set search goals</Link>
      </p>
    )
  }
  const look = LOOK[fit.verdict]
  const title = fit.verdict === "ok" ? `Fits your goal “${fit.goal.name}”` : fit.verdict === "blocked" ? `Doesn’t fit your goal “${fit.goal.name}”` : fit.implicit ? "Check this against where you are" : `Check this against “${fit.goal.name}”`
  const shown = fit.verdict === "ok" ? fit.checks : fit.checks.filter((item) => item.status !== "ok")
  return (
    <section aria-label="Search goal check" className={cn("grid gap-2 rounded-xl border px-4 py-3", look.frame)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium"><look.icon className={cn("size-4", look.className)} /> {title}</p>
        <Link href="/profile" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{fit.implicit ? "Set search goals" : "Edit goals"}</Link>
      </div>
      <ul className="grid gap-1 text-sm">
        {shown.map((item) => {
          const Icon = LOOK[item.status].icon
          return <li key={item.kind} className="flex items-start gap-2"><Icon className={cn("mt-0.5 size-3.5 shrink-0", LOOK[item.status].className)} /> {item.text}</li>
        })}
      </ul>
      {fit.implicit ? <p className="text-xs text-muted-foreground">Based on the location in your profile only. Add a search goal to check the contract, work mode and work rights too.</p> : null}
    </section>
  )
}

/** Compact goal verdict for list rows; the checks that need a look are in the tooltip text. */
export function GoalFitBadge({ fit }: { fit: GoalFit | null }) {
  if (!fit || (fit.implicit && fit.verdict === "ok")) return null
  const look = LOOK[fit.verdict]
  const label = fit.implicit ? "Check location" : fit.verdict === "ok" ? "Fits goal" : fit.verdict === "blocked" ? "Off goal" : "Check goal"
  const why = (fit.verdict === "ok" ? fit.checks : fit.checks.filter((item) => item.status !== "ok")).map((item) => item.text).join("\n")
  return (
    <span title={`${fit.goal.name}\n${why}`} className={cn("inline-flex items-center gap-1 font-medium", look.className)}>
      <look.icon className="size-3.5" /> {label}
    </span>
  )
}
