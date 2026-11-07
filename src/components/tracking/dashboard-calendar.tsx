"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { CalendarDaysIcon } from "lucide-react"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export type CalendarEvent = { id: string; title: string; company: string; logoPath: string | null; nextStep: string; due: string }

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

/** A month at a glance: days with a next step are marked; pick a day to see what's due. */
export function DashboardCalendar({ events, now }: { events: CalendarEvent[]; now: number }) {
  const today = useMemo(() => new Date(now), [now])
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = dayKey(new Date(event.due))
      map.set(key, [...(map.get(key) ?? []), event])
    }
    return map
  }, [events])
  const upcoming = useMemo(() => events.filter((event) => new Date(event.due) >= new Date(today.getFullYear(), today.getMonth(), today.getDate())).sort((a, b) => a.due.localeCompare(b.due)), [events, today])
  const [selected, setSelected] = useState<Date>(today)
  const dayEvents = byDay.get(dayKey(selected)) ?? []
  const isToday = dayKey(selected) === dayKey(today)
  const label = isToday ? "Today" : selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
  const comingUp = upcoming.filter((event) => dayKey(new Date(event.due)) !== dayKey(selected)).slice(0, 3)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle><h2>Calendar</h2></CardTitle>
        <CardDescription>{upcoming.length ? `${upcoming.length} upcoming next step${upcoming.length === 1 ? "" : "s"}` : "No dated next steps"}</CardDescription>
        {!isToday ? (
          <CardAction>
            <Button size="xs" variant="ghost" onClick={() => setSelected(today)}>Today</Button>
          </CardAction>
        ) : null}
      </CardHeader>
      {/* Side by side when the card is wide, stacked when it's narrow. */}
      <CardContent className="@container/cal">
        <div className="grid gap-4 @min-[34rem]/cal:grid-cols-[auto_minmax(0,1fr)] @min-[34rem]/cal:gap-6">
        <Calendar
          mode="single"
          required
          selected={selected}
          onSelect={setSelected}
          defaultMonth={today}
          className="mx-auto p-0 [--cell-size:--spacing(8)] @min-[34rem]/cal:mx-0"
          modifiers={{ busy: (date) => byDay.has(dayKey(date)) }}
          modifiersClassNames={{ busy: "[&>button]:font-semibold [&>button]:after:absolute [&>button]:after:bottom-1 [&>button]:after:left-1/2 [&>button]:after:size-1 [&>button]:after:-translate-x-1/2 [&>button]:after:rounded-full [&>button]:after:bg-current [&>button]:relative" }}
        />
        <div className="grid content-start gap-3 border-t pt-3 @min-[34rem]/cal:border-t-0 @min-[34rem]/cal:border-s @min-[34rem]/cal:ps-6 @min-[34rem]/cal:pt-0">
          <div className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {dayEvents.length ? (
              <EventList key={dayKey(selected)} events={dayEvents} />
            ) : (
              <p key={dayKey(selected)} className="cb-fade flex items-center gap-2 px-1.5 py-1 text-sm text-muted-foreground">
                <CalendarDaysIcon className="size-4 shrink-0" /> Nothing due{isToday ? " today" : " that day"}.
              </p>
            )}
          </div>
          {/* What's coming, so an empty day still shows something useful. */}
          {comingUp.length ? (
            <div className="grid gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Coming up</p>
              <EventList events={comingUp} showDate onPick={(event) => setSelected(new Date(event.due))} />
            </div>
          ) : !upcoming.length ? (
            <p className="px-1.5 text-xs text-muted-foreground">Add a date to a next step on an application to see it here.</p>
          ) : null}
        </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EventList({ events, showDate = false, onPick }: { events: CalendarEvent[]; showDate?: boolean; onPick?: (event: CalendarEvent) => void }) {
  return (
    <ul className="cb-stagger grid gap-0.5">
      {events.map((event) => {
        const date = new Date(event.due)
        return (
          <li key={event.id} className="flex min-w-0 items-center gap-1">
            {showDate ? (
              <button type="button" onClick={() => onPick?.(event)} title="Show this day" className="grid w-10 shrink-0 justify-items-center rounded-md py-1 leading-tight hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring">
                <span className="text-[11px] text-muted-foreground uppercase">{date.toLocaleDateString(undefined, { month: "short" })}</span>
                <span className="text-sm font-semibold tabular-nums">{date.getDate()}</span>
              </button>
            ) : null}
            <Link href={`/applications/${event.id}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
              <EntryLogo path={event.logoPath} name={event.company || event.title} size={24} className="rounded-md" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-medium">{event.nextStep || "Next step"}</span>
                <span className="truncate text-xs text-muted-foreground">{[event.company, event.title].filter(Boolean).join(" · ")}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
