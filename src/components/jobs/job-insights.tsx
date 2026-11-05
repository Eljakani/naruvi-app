"use client"

import { useTransition } from "react"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { refreshJobInsightsAction } from "@/app/(app)/jobs/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { JobInsights as Insights } from "@/server/jobs/enrich"

const LABEL: Record<string, string> = {
  intern: "Internship", junior: "Junior", mid: "Mid-level", senior: "Senior", lead: "Lead / staff", manager: "Manager", executive: "Executive",
  onsite: "On-site", hybrid: "Hybrid", remote: "Remote",
  permanent: "Permanent", fixed_term: "Fixed-term", freelance: "Freelance", internship: "Internship", apprenticeship: "Apprenticeship",
}
const ENGINE: Record<Insights["engine"], string> = { decisions: "Decision model", "language-model": "Language model", rules: "Rules" }

export function JobInsights({ jobId, insights }: { jobId: string; insights: Insights | null }) {
  const [pending, startTransition] = useTransition()
  const refresh = () =>
    startTransition(async () => {
      const result = await refreshJobInsightsAction(jobId)
      if (!result.ok) toast.error(result.error)
    })

  const facts = insights
    ? ([
        ["Seniority", insights.seniority],
        ["Work mode", insights.workMode],
        ["Contract", insights.contract],
      ] as const).filter(([, value]) => value !== "unspecified")
    : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>At a glance</CardTitle>
        <CardDescription>{insights ? `${ENGINE[insights.engine]}${insights.model ? ` · ${insights.model}` : ""}` : "Not analyzed yet."}</CardDescription>
        <CardAction>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={pending} aria-label="Refresh insights">
            {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {insights ? "Refresh" : "Analyze"}
          </Button>
        </CardAction>
      </CardHeader>
      {insights ? (
        <CardContent className="grid gap-4">
          {insights.summary ? <p className="text-sm">{insights.summary}</p> : null}
          {facts.length || insights.yearsRequired || insights.visaSponsorship !== null ? (
            <div className="flex flex-wrap gap-2">
              {facts.map(([label, value]) => (
                <Badge key={label} variant="secondary">
                  {label}: {LABEL[value] ?? value}
                </Badge>
              ))}
              {insights.yearsRequired ? <Badge variant="secondary">{insights.yearsRequired}+ years</Badge> : null}
              {insights.visaSponsorship === true ? <Badge variant="secondary">Visa / relocation support</Badge> : null}
              {insights.visaSponsorship === false ? <Badge variant="outline">No sponsorship</Badge> : null}
            </div>
          ) : null}
          {insights.skills.required.length ? (
            <div className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">Required skills</span>
              <div className="flex flex-wrap gap-1">
                {insights.skills.required.map((skill) => (
                  <Badge key={skill}>{skill}</Badge>
                ))}
              </div>
            </div>
          ) : null}
          {insights.skills.nice.length ? (
            <div className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">Nice to have</span>
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
