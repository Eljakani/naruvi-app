"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "motion/react"
import { FileTextIcon, GaugeIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

/** Job posting ⇄ Fit check, in the app's pill style. The pill glides; the fit score rides along on its tab. */
export function SectionTabs({ applicationId, current, fit }: { applicationId: string; current: "overview" | "analysis"; fit: number | null | undefined }) {
  const t = useTranslations("application.tabs")
  const reduced = useReducedMotion()
  const tone = fit == null ? "" : fit >= 75 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : fit >= 50 ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
  const items = [
    { value: "overview", label: t("posting"), icon: FileTextIcon, href: `/applications/${applicationId}?tab=overview` },
    { value: "analysis", label: t("fit"), icon: GaugeIcon, href: `/applications/${applicationId}` },
  ] as const
  return (
    <nav className="flex w-fit rounded-lg bg-muted p-0.5" aria-label={t("label")}>
      {items.map((item) => {
        const active = current === item.value
        return (
          <Link key={item.value} href={item.href} scroll={false} aria-current={active ? "page" : undefined}
            className={cn("relative flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {active ? <motion.span layoutId="application-section" transition={reduced ? { duration: 0 } : { type: "spring", duration: 0.35, bounce: 0.15 }} className="absolute inset-0 rounded-md bg-background shadow-xs ring-1 ring-foreground/5" /> : null}
            <item.icon className="relative size-3.5" aria-hidden />
            <span className="relative">{item.label}</span>
            {item.value === "analysis" ? (
              fit != null
                ? <span className={cn("relative rounded-full px-1.5 text-[11px] leading-4 font-semibold tabular-nums", tone)} aria-label={t("fitScore", { fit })}>{fit}</span>
                : <span className="relative rounded-full bg-background/70 px-1.5 text-[11px] leading-4 text-muted-foreground ring-1 ring-border">{t("notRun")}</span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
