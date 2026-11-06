"use client"

import Link from "next/link"
import { useOptimistic, useTransition } from "react"
import { InboxIcon, PlusIcon, XIcon } from "lucide-react"
import { dismissLeadAction } from "@/app/(app)/jobs/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Lead = { id: string; url: string; title: string; board: string; source: string; foundAt: Date }

const BOARD: Record<string, string> = { linkedin: "LinkedIn", indeed: "Indeed", welcometothejungle: "Welcome to the Jungle", glassdoor: "Glassdoor", greenhouse: "Greenhouse", lever: "Lever", ashbyhq: "Ashby", smartrecruiters: "SmartRecruiters", myworkdayjobs: "Workday", workable: "Workable", teamtailor: "Teamtailor", recruitee: "Recruitee" }

/** Postings found in job-alert emails or saved with the browser extension. Import reads the posting like any link; nothing is saved until you check it. */
export function JobLeads({ leads }: { leads: Lead[] }) {
  const [visible, hide] = useOptimistic(leads, (state, id: string) => state.filter((lead) => lead.id !== id))
  const [, startTransition] = useTransition()
  if (!visible.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <InboxIcon className="size-4" /> Job leads
        </CardTitle>
        <CardDescription className="text-xs">{visible.length} posting{visible.length === 1 ? "" : "s"} from your job alerts and browser, not saved yet. Import one to read and check it.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {visible.map((lead) => (
            <li key={lead.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <a href={lead.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:underline">
                  {lead.title || lead.url.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
                <p className="truncate text-xs text-muted-foreground">{lead.source} · {new Date(lead.foundAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
              </div>
              <Badge variant="outline" className="font-normal">{BOARD[lead.board] ?? lead.board}</Badge>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/jobs/new?lead=${lead.id}`} />}>
                  <PlusIcon /> Import
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Dismiss ${lead.title || "this posting"}`}
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
