import { ArrowDownLeftIcon, ArrowUpRightIcon, BookmarkIcon, FileTextIcon, FlagIcon, XIcon, type LucideIcon } from "lucide-react"
import type { Status } from "@/lib/stages"
import { cn } from "@/lib/utils"
import { useLocale, useTranslations } from "next-intl"

type Event = { id: string; fromStatus: Status | null; toStatus: Status; actor: string; createdAt: Date }
type Mail = { id: string; direction: string; fromName: string; fromAddress?: string | null; subject: string; sentAt: Date }
type Draft = { kind: string; updatedAt: Date; current: string | null }
type Item = { id: string; at: Date; icon: LucideIcon; tone: "in" | "out" | "stage" | "closed" | "muted"; title: string; detail?: string }

const SHOWN = 6
const TONE: Record<Item["tone"], string> = {
  in: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  out: "bg-brand/15 text-brand",
  stage: "bg-muted text-foreground",
  closed: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  muted: "bg-muted text-muted-foreground",
}

/**
 * Everything that happened, newest first: emails both ways, stage moves and
 * document work. The progress strip above shows where you are; this shows
 * what happened, so the two never repeat each other.
 */
type Words = { t: ReturnType<typeof useTranslations<"application.journey">>; tl: ReturnType<typeof useTranslations<"labels">> }
function collect(createdAt: Date, events: Event[], mail: Mail[], drafts: Draft[], { t, tl }: Words): Item[] {
  const items: Item[] = [{ id: "saved", at: createdAt, icon: BookmarkIcon, tone: "muted", title: t("saved") }]
  let last: Status | null = null
  for (const event of [...events].reverse()) {
    // Same stage twice in a row (an automatic move then a manual confirm) is one moment.
    if (event.toStatus === last) continue
    last = event.toStatus
    const closed = event.toStatus === "rejected" || event.toStatus === "withdrawn"
    items.push({ id: event.id, at: event.createdAt, icon: closed ? XIcon : FlagIcon, tone: closed ? "closed" : "stage", title: t("moved", { status: tl(`status.${event.toStatus}`) }), detail: event.actor === "system" ? t("automatic") : undefined })
  }
  for (const message of mail) {
    const incoming = message.direction === "in"
    const who = message.fromName || message.fromAddress || t("they")
    items.push({ id: message.id, at: message.sentAt, icon: incoming ? ArrowDownLeftIcon : ArrowUpRightIcon, tone: incoming ? "in" : "out", title: incoming ? t("wrote", { who }) : t("sent"), detail: message.subject || t("noSubject") })
  }
  for (const draft of drafts) {
    if (!draft.current) continue
    items.push({ id: `doc-${draft.kind}`, at: draft.updatedAt, icon: FileTextIcon, tone: "muted", title: draft.kind === "cv" ? t("cvEdited") : t("letterEdited") })
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime())
}

const dayLabel = (date: Date, locale: string, t: Words["t"]) => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return t("today")
  if (date.toDateString() === yesterday.toDateString()) return t("yesterday")
  return date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) })
}
const time = (date: Date, locale: string) => date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })

function Feed({ items }: { items: Item[] }) {
  const t = useTranslations("application.journey")
  const locale = useLocale()
  // Grouped by day, so a busy day reads as one block.
  const days: { label: string; items: Item[] }[] = []
  for (const item of items) {
    const label = dayLabel(item.at, locale, t)
    if (days.at(-1)?.label === label) days.at(-1)!.items.push(item)
    else days.push({ label, items: [item] })
  }
  return (
    <div className="grid gap-3">
      {days.map((day) => (
        <div key={day.label} className="grid gap-1.5">
          <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{day.label}</h3>
          <ul className="grid gap-2">
            {day.items.map((item) => (
              <li key={item.id} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-2.5">
                <span className={cn("grid size-7 place-content-center rounded-lg", TONE[item.tone])} aria-hidden><item.icon className="size-3.5" /></span>
                <span className="grid min-w-0">
                  <span className="truncate text-sm leading-5">{item.title}</span>
                  {item.detail ? <span className="truncate text-xs leading-4 text-muted-foreground" title={item.detail}>{item.detail}</span> : null}
                </span>
                <time className="text-xs leading-5 text-muted-foreground tabular-nums" dateTime={item.at.toISOString()} title={item.at.toLocaleString(locale)}>{time(item.at, locale)}</time>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** The application's activity log: what happened and when, newest first. */
export function ApplicationJourney({ createdAt, events, mail = [], drafts = [], className }: { createdAt: Date; events: Event[]; mail?: Mail[]; drafts?: Draft[]; className?: string }) {
  const t = useTranslations("application.journey")
  const tl = useTranslations("labels")
  const all = collect(createdAt, events, mail, drafts, { t, tl })
  const older = all.slice(SHOWN)
  return (
    <section className={cn("grid gap-3 rounded-xl border p-4", className)} aria-labelledby="activity-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="activity-title" className="text-sm font-semibold">{t("title")}</h2>
        <span className="text-xs text-muted-foreground">{t("events", { count: all.length })}</span>
      </div>
      <Feed items={all.slice(0, SHOWN)} />
      {older.length ? (
        <details className="group grid gap-3">
          <summary className="w-fit cursor-pointer rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{t("older", { count: older.length })}</summary>
          <div className="mt-3"><Feed items={older} /></div>
        </details>
      ) : null}
    </section>
  )
}
