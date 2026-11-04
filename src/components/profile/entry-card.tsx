"use client"

import { AlertTriangleIcon, ChevronRightIcon, LockIcon } from "lucide-react"
import { KIND_SINGULAR, STATUS_LABELS } from "@/components/profile/labels"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ProfileEntry } from "@/server/profile/repository"

export function EntryCard({ entry, attention, onOpen }: { entry: ProfileEntry; attention: boolean; onOpen: () => void }) {
  const display = entry.display.en ?? entry.display.fr ?? {}
  const subtitle = [display.organization, display.dates, display.location].filter(Boolean).join(" · ")
  const bullets = entry.phrasings.filter((phrasing) => phrasing.role === "bullet")
  const ungrounded = bullets.filter((phrasing) => !phrasing.grounding.grounded).length
  const languages = [...new Set(entry.phrasings.map((phrasing) => phrasing.language))].sort()
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), onOpen())}
      className={cn(
        "group flex cursor-pointer flex-row items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        entry.status === "archived" && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{display.role || entry.title}</span>
          <Badge variant="outline" className="text-[11px]">
            {KIND_SINGULAR[entry.kind]}
          </Badge>
          {entry.status !== "verified" ? <Badge variant="secondary">{STATUS_LABELS[entry.status]}</Badge> : null}
          {entry.confidential ? (
            <Badge variant="outline" className="gap-1 text-[11px]">
              <LockIcon className="size-3" /> NDA
            </Badge>
          ) : null}
        </div>
        {subtitle || (display.role && display.role !== entry.title) ? (
          <p className="truncate text-sm text-muted-foreground">{subtitle || entry.title}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{entry.facts.length} facts</span>
          <span className="tabular-nums">{bullets.length} bullets</span>
          {languages.length ? <span>{languages.map((lang) => lang.toUpperCase()).join(" / ")}</span> : null}
          {entry.doNotClaim.length ? <span className="tabular-nums">{entry.doNotClaim.length} do-not-claim</span> : null}
          {ungrounded ? (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <AlertTriangleIcon className="size-3" /> {ungrounded} ungrounded
            </span>
          ) : null}
          {entry.facts.length === 0 && entry.kind !== "skill" ? (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <AlertTriangleIcon className="size-3" /> no facts
            </span>
          ) : null}
        </div>
      </div>
      {attention ? <span className="size-2 shrink-0 rounded-full bg-amber-500" aria-label="Needs review" /> : null}
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Card>
  )
}
