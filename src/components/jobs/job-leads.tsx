"use client"

import Link from "next/link"
import { useOptimistic, useTransition } from "react"
import { InboxIcon, PlusIcon, XIcon } from "lucide-react"
import { dismissLeadAction } from "@/app/[locale]/(app)/jobs/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useLocale, useTranslations } from "next-intl"

type Lead = { id: string; url: string; title: string; board: string; source: string; foundAt: Date }

const BOARD: Record<string, string> = { ashby: "Ashby", linkedin: "LinkedIn", indeed: "Indeed", welcometothejungle: "Welcome to the Jungle", glassdoor: "Glassdoor", greenhouse: "Greenhouse", lever: "Lever", ashbyhq: "Ashby", smartrecruiters: "SmartRecruiters", myworkdayjobs: "Workday", workable: "Workable", teamtailor: "Teamtailor", recruitee: "Recruitee" }

/** Postings found in job-alert emails or saved with the browser extension. Import reads the posting like any link; nothing is saved until you check it. */
export function JobLeads({ leads }: { leads: Lead[] }) {
  const t = useTranslations("jobs.leads")
  const locale = useLocale()
  const [visible, hide] = useOptimistic(leads, (state, id: string) => state.filter((lead) => lead.id !== id))
  const [, startTransition] = useTransition()
  if (!visible.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <InboxIcon className="size-4" /> {t("title")}
        </CardTitle>
        <CardDescription className="text-xs">{t("description", { count: visible.length })}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {visible.map((lead) => (
            <li key={lead.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <a href={lead.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:underline">
                  {lead.title || lead.url.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
                <p className="truncate text-xs text-muted-foreground">{lead.source} · {new Date(lead.foundAt).toLocaleDateString(locale, { day: "numeric", month: "short" })}</p>
              </div>
              <Badge variant="outline" className="font-normal">{BOARD[lead.board] ?? lead.board}</Badge>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/jobs/new?lead=${lead.id}`} />}>
                  <PlusIcon /> {t("import")}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("dismiss", { title: lead.title || t("thisPosting") })}
                  onClick={() =>
                    startTransition(async () => {
                      hide(lead.id)
                      await dismissLeadAction(lead.id)
                    })
                  }
                >
                  <XIcon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
