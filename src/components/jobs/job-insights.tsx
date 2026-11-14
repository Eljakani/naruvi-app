"use client"

import { useTransition } from "react"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { refreshJobInsightsAction } from "@/app/[locale]/(app)/jobs/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { JobInsights as Insights } from "@/server/jobs/enrich"
import { useTranslations } from "next-intl"

const GROUP = { seniority: "seniority", workMode: "workMode", contract: "contract" } as const

export function JobInsights({ jobId, insights }: { jobId: string; insights: Insights | null }) {
  const t = useTranslations("jobs.insights")
  const tl = useTranslations("labels")
  const [pending, startTransition] = useTransition()
  const refresh = () =>
    startTransition(async () => {
      const result = await refreshJobInsightsAction(jobId)
      if (!result.ok) toast.error(result.error)
    })

  const facts = insights
    ? ([
        ["seniority", insights.seniority],
        ["workMode", insights.workMode],
        ["contract", insights.contract],
      ] as const).filter(([, value]) => value !== "unspecified")
    : []

  // Nothing summarized yet: one quiet line with the action, not an empty card.
  if (!insights) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed px-4 py-2.5 text-sm">
        <span className="font-medium">{t("title")}</span>
        <span className="text-muted-foreground">{t("notYet")}</span>
        <Button size="sm" variant="ghost" className="ms-auto" onClick={refresh} disabled={pending} aria-label={t("refreshLabel")}>
          {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {t("summarize")}
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{insights ? `${t(`engine.${insights.engine}`)}${insights.model ? ` · ${insights.model}` : ""}` : t("notYet")}</CardDescription>
        <CardAction>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={pending} aria-label={t("refreshLabel")}>
            {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {insights ? t("refresh") : t("summarize")}
          </Button>
        </CardAction>
      </CardHeader>
      {insights ? (
        <CardContent className="grid gap-4">
          {insights.summary ? <p className="max-w-[32rem] text-sm">{insights.summary}</p> : null}
          {facts.length || insights.yearsRequired || insights.programme || insights.visaSponsorship !== null ? (
            <div className="flex flex-wrap gap-2">
              {facts.map(([label, value]) => (
                <Badge key={label} variant="secondary">
                  {t(`facts.${label}`)}: {tl.has(`${GROUP[label]}.${value}` as never) ? tl(`${GROUP[label]}.${value}` as never) : value}
                </Badge>
              ))}
              {insights.programme?.duration ? <Badge variant="secondary">{t("duration", { value: insights.programme.duration })}</Badge> : null}
              {insights.programme?.start ? <Badge variant="secondary">{t("starts", { value: insights.programme.start })}</Badge> : null}
              {insights.programme?.rhythm ? <Badge variant="secondary">{t("rhythm", { value: insights.programme.rhythm })}</Badge> : null}
              {insights.yearsRequired ? <Badge variant="secondary">{t("years", { years: insights.yearsRequired })}</Badge> : null}
              {insights.visaSponsorship === true ? <Badge variant="secondary">{t("visa")}</Badge> : null}
              {insights.visaSponsorship === false ? <Badge variant="outline">{t("noSponsor")}</Badge> : null}
            </div>
          ) : null}
          {insights.skills.required.length ? (
            <div className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{t("required")}</span>
              <div className="flex flex-wrap gap-1">
                {insights.skills.required.map((skill) => (
                  <Badge key={skill}>{skill}</Badge>
                ))}
              </div>
            </div>
          ) : null}
          {insights.skills.nice.length ? (
            <div className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{t("nice")}</span>
              <div className="flex flex-wrap gap-1">
                {insights.skills.nice.map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  )
}
