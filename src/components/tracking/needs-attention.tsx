import Link from "next/link"
import { ArrowRightIcon, CalendarClockIcon, CheckCircle2Icon, FileTextIcon, HourglassIcon, SendIcon, type LucideIcon } from "lucide-react"
import { EntryLogo } from "@/components/profile/entry-logo"
import { ArchiveButton } from "@/components/tracking/next-step"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { dueLabel, dueTone, type AttentionItem, type AttentionReason } from "@/lib/attention"
import { cn } from "@/lib/utils"

const REASON: Record<AttentionReason, { icon: LucideIcon; label: string }> = {
  due: { icon: CalendarClockIcon, label: "Due" },
  ready: { icon: SendIcon, label: "Ready to send" },
  quiet: { icon: HourglassIcon, label: "No reply" },
  "strong-fit": { icon: FileTextIcon, label: "Not started" },
}

const LIMIT = 6

/** The short list of applications that need you today, most urgent first. */
export function NeedsAttention({ items, upcoming, now }: { items: AttentionItem[]; upcoming: { id: string; title: string; company: string; nextStep: string; due: Date }[]; now: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>{items.length ? `${items.length} thing${items.length === 1 ? "" : "s"} to do: due next steps, documents waiting to go out and applications that went quiet.` : "Nothing is due. Set a next step on an application to be reminded here."}</CardDescription>
        {items.length > LIMIT ? (
          <CardAction>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/applications?view=list" />}>
              All applications <ArrowRightIcon />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {items.length ? (
          <ul className="divide-y rounded-lg border">
            {items.slice(0, LIMIT).map((item) => {
              const reason = REASON[item.reason]
              const overdue = item.reason === "due" && item.nextStepDue && dueTone(item.nextStepDue, now) === "overdue"
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                  <EntryLogo path={item.logoPath} name={item.company || "?"} size={32} />
                  <Link href={`/applications/${item.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:underline">{item.title}{item.company ? <span className="font-normal text-muted-foreground"> · {item.company}</span> : null}</span>
                    <span className={cn("flex min-w-0 items-center gap-1 text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                      <reason.icon className="size-3 shrink-0" aria-label={reason.label} />
                      <span className="truncate">{item.message}</span>
                    </span>
                  </Link>
                  <div className="flex shrink-0 gap-1">
                    {item.action === "archive" ? <ArchiveButton id={item.id} archived={false} size="sm" /> : null}
                    <Button size="sm" variant={item.action === "archive" ? "ghost" : "outline"} nativeButton={false} render={<Link href={item.action === "cv" ? `/applications/${item.id}/cv` : `/applications/${item.id}`} />}>
                      {item.action === "cv" ? "Draft CV" : "Open"}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            <CheckCircle2Icon className="size-4 text-primary" /> All caught up.
          </div>
        )}
        {upcoming.length ? (
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Coming up</p>
            <ul className="grid gap-1">
              {upcoming.map((item) => (
                <li key={item.id}>
                  <Link href={`/applications/${item.id}`} className="flex items-center justify-between gap-3 rounded-md px-1 py-0.5 text-sm hover:bg-muted/50">
                    <span className="min-w-0 truncate">{item.nextStep || "Next step"} <span className="text-muted-foreground">· {item.title}{item.company ? `, ${item.company}` : ""}</span></span>
                    <span className="shrink-0 text-xs text-muted-foreground">{dueLabel(item.due, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
