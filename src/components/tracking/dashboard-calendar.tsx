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
  const next = upcoming.find((event) => new Date(event.due) > selected)

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
      <CardContent className="grid gap-3">
        <Calendar
          mode="single"
          required
          selected={selected}
          onSelect={setSelected}
          defaultMonth={today}
          className="mx-auto p-0 [--cell-size:--spacing(8)]"
          modifiers={{ busy: (date) => byDay.has(dayKey(date)) }}
          modifiersClassNames={{ busy: "[&>button]:font-semibold [&>button]:after:absolute [&>button]:after:bottom-1 [&>button]:after:left-1/2 [&>button]:after:size-1 [&>button]:after:-translate-x-1/2 [&>button]:after:rounded-full [&>button]:after:bg-current [&>button]:relative" }}
        />
        <div className="grid gap-1.5 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {dayEvents.length ? (
            <ul key={dayKey(selected)} className="cb-stagger grid gap-1">
              {dayEvents.map((event) => (
                <li key={event.id}>
                  <Link href={`/applications/${event.id}`} className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2">
                    <EntryLogo path={event.logoPath} name={event.company || event.title} size={24} className="rounded-md" />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">{event.nextStep || "Next step"}</span>
                      <span className="truncate text-xs text-muted-foreground">{[event.company, event.title].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p key={dayKey(selected)} className="cb-fade flex items-center gap-2 px-1.5 py-1 text-sm text-muted-foreground">
              <CalendarDaysIcon className="size-4 shrink-0" />
              {next ? (
                <span className="min-w-0">
                  Nothing due. Next:{" "}
                  <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setSelected(new Date(next.due))}>
                    {new Date(next.due).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </button>
                </span>
              ) : (
                <span>Nothing due. Add a date to a next step on an application to see it here.</span>
              )}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
