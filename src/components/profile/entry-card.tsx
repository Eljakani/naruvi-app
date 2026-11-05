"use client"

import Link from "next/link"
import { CheckCircle2Icon, ChevronRightIcon, LockIcon } from "lucide-react"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ProfileEntry } from "@/server/profile/repository"

const LOGO_KINDS = ["experience", "education", "project", "certification", "achievement"]

/** One line per entry: what it is, where, when, and whether it's ready. */
export function EntryCard({ entry, attention }: { entry: ProfileEntry; attention: boolean }) {
  const display = entry.display.en ?? entry.display.fr ?? {}
  const subtitle = entry.kind === "skill" || entry.kind === "language" ? entry.skills.slice(0, 8).join(" · ") : [display.organization, display.dates, display.location].filter(Boolean).join(" · ")
  const reason = entry.status === "archived" ? "Archived" : entry.status !== "verified" ? "Needs a look" : entry.facts.length === 0 && entry.kind !== "skill" && entry.kind !== "language" ? "No facts yet" : entry.phrasings.some((phrasing) => !phrasing.grounding.grounded) ? "A CV line needs a fact" : ""
  return (
    <Link href={`/profile/${entry.id}`} className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Card className={cn("flex flex-row items-center gap-3 px-4 py-3 transition-colors group-hover:bg-muted/40", entry.status === "archived" && "opacity-60")}>
        {LOGO_KINDS.includes(entry.kind) ? <EntryLogo path={entry.logoPath} name={display.organization || entry.title} size={36} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{display.role || entry.title}</span>
            {entry.confidential ? (
              <Badge variant="outline" className="gap-1">
                <LockIcon className="size-3" /> NDA
              </Badge>
            ) : null}
          </div>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {attention && reason ? (
          <Badge variant="secondary">{reason}</Badge>
        ) : (
          <CheckCircle2Icon className="size-4 shrink-0 text-muted-foreground" aria-label="Ready" />
        )}
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  )
}
