"use client"

import { useState, useTransition } from "react"
import { Loader2Icon, MaximizeIcon, MinimizeIcon, ScanTextIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { fitCvDesignAction, suggestCvDesignsAction } from "@/app/[locale]/(app)/applications/[id]/cv/actions"
import type { DesignChange } from "@/components/applications/design-picker"
import { PdfThumb } from "@/components/templates/pdf-thumb"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PRESETS, type DesignTokens } from "@/lib/design"
import { designInsights, type DesignInsights } from "@/lib/design-insights"
import { cn } from "@/lib/utils"
import type { CvDocument } from "@/server/documents/model"
import type { DesignProposal } from "@/server/templates/design-director"
import { useTranslations } from "next-intl"

const ATS_TONE: Record<DesignInsights["ats"], string> = {
  high: "border-emerald-600/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  good: "border-sky-600/25 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  fair: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
}

/** How applicant tracking systems read a design, as a small labelled badge. */
export function AtsBadge({ insights, className }: { insights: DesignInsights; className?: string }) {
  const t = useTranslations("designInsights")
  const reasons = insights.reasons.map((reason) => t(`reasons.${reason}`)).join(" ")
  return (
    <span title={reasons || t("clean")} className={cn("inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 font-medium", ATS_TONE[insights.ats], className)}>
      <ScanTextIcon aria-hidden className="size-3" /> {t(`ats.${insights.ats}`)}
    </span>
  )
}

/**
 * The Look tab's helpers for one CV: what the current design means for
 * applicant tracking systems, fitting the layout to a page count, and three
 * designs chosen for this job. Each applies through the same path as picking
 * a design by hand, so it is saved as a new version and can be undone.
 */
export function DesignAdvisor({ applicationId, draft, tokens, pages, onApply, disabled }: { applicationId: string; draft: CvDocument; tokens: DesignTokens; pages: number; onApply: (change: DesignChange) => void; disabled?: boolean }) {
  const t = useTranslations("designAdvisor")
  const ti = useTranslations("designInsights")
  const [fitting, startFit] = useTransition()
  const [suggesting, startSuggest] = useTransition()
  const [proposals, setProposals] = useState<{ items: DesignProposal[]; byModel: boolean } | null>(null)
  const insights = designInsights(tokens)
  const busy = disabled || fitting || suggesting
  const use = (next: DesignTokens) => onApply({ template: "custom", design: next, templateRef: null, accent: next.accent })

  const fit = (target: number) =>
    startFit(async () => {
      const result = await fitCvDesignAction(draft, target).catch(() => null)
      if (!result?.ok) return void toast.error(result?.error ?? t("failed"))
      const { tokens: fitted, fits, direction, pages: now } = result.data
      if (!fits) return void toast.warning(t("cantFit", { count: target }))
      if (direction === "none") return void toast(t("nothing"))
      use(fitted)
      toast.success(direction === "tightened" ? t("tightened", { count: now }) : t("loosened"))
    })

  const suggest = () =>
    startSuggest(async () => {
      const result = await suggestCvDesignsAction(applicationId, draft).catch(() => null)
      if (!result?.ok) return void toast.error(result?.error ?? t("failed"))
      setProposals({ items: result.data.proposals, byModel: result.data.byModel })
    })

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <AtsBadge insights={insights} />
          <span className="text-xs text-muted-foreground">{ti(`density.${insights.density}`)}</span>
        </div>
        {insights.reasons.length ? (
          <ul className="grid gap-0.5 text-xs text-muted-foreground">
            {insights.reasons.map((reason) => <li key={reason}>{ti(`reasons.${reason}`)}</li>)}
          </ul>
        ) : <p className="text-xs text-muted-foreground">{ti("clean")}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {pages > 1 ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fit(pages - 1)}>
              {fitting ? <Loader2Icon className="animate-spin" /> : <MinimizeIcon />} {t("fitTo", { count: pages - 1 })}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fit(pages)}>
            {fitting ? <Loader2Icon className="animate-spin" /> : <MaximizeIcon />} {t("fill", { count: pages })}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("fitHint")}</p>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={suggest}>
            <SparklesIcon className={cn("text-brand", suggesting && "cb-breathe")} />
            <span className={suggesting ? "cb-shimmer" : undefined}>{suggesting ? t("suggesting") : proposals ? t("suggestAgain") : t("suggest")}</span>
          </Button>
        </div>
        {!proposals ? <p className="text-xs text-muted-foreground">{t("suggestHint")}</p> : null}
        {proposals && !proposals.items.length ? <p className="text-xs text-muted-foreground">{t("empty")}</p> : null}
        {proposals?.items.length ? (
          <ul className="grid gap-3">
            {proposals.items.map((proposal, index) => (
              <li key={proposal.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-lg border bg-card p-2.5">
                <PdfThumb tokens={proposal.tokens} />
                <div className="grid min-w-0 content-start gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{proposal.name}</span>
                    {index === 0 ? <Badge variant="secondary" className="text-[11px]">{t("first")}</Badge> : null}
                  </div>
                  <p className="text-xs text-pretty text-muted-foreground [overflow-wrap:anywhere]">{proposal.why || t(`rules.${proposal.rule}`)}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <AtsBadge insights={proposal.insights} />
                    <span>{t("basedOn", { name: PRESETS[proposal.base]?.name ?? proposal.base })}</span>
                    <span>· {t("pages", { count: proposal.pages })}</span>
                    {proposal.fitted !== "none" ? <span>· {t(`fitted.${proposal.fitted}`)}</span> : null}
                  </div>
                  <Button size="xs" className="mt-0.5 w-fit" disabled={busy} onClick={() => use(proposal.tokens)}>{t("use")}</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {proposals?.items.length && !proposals.byModel ? <p className="text-xs text-muted-foreground">{t("byRule")}</p> : null}
      </div>
    </div>
  )
}
