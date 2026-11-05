"use client"

import Link from "next/link"
import { useOptimistic, useState, useTransition } from "react"
import { EllipsisIcon } from "lucide-react"
import { toast } from "sonner"
import { moveApplicationAction } from "@/app/(app)/applications/actions"
import { FitRing } from "@/components/applications/fit-ring"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { COLUMNS, columnOf, MANUAL_STATUSES, STATUS_LABEL, statusForColumn, type ColumnId, type Status } from "@/lib/stages"
import { cn } from "@/lib/utils"

export type BoardItem = {
  id: string
  title: string
  company: string
  logoPath: string | null
  status: Status
  fit: number | null
  since: string
}

function age(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`
}

export function Board({ items }: { items: BoardItem[] }) {
  const [optimistic, applyMove] = useOptimistic(items, (state, move: { id: string; status: Status }) => state.map((item) => (item.id === move.id ? { ...item, status: move.status, since: new Date().toISOString() } : item)))
  const [, startTransition] = useTransition()
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<ColumnId | null>(null)

  const move = (id: string, status: Status) => {
    const item = optimistic.find((entry) => entry.id === id)
    if (!item || item.status === status) return
    startTransition(async () => {
      applyMove({ id, status })
      const result = await moveApplicationAction(id, status)
      if (!result.ok) toast.error(result.message ?? "Couldn’t move the application")
      else toast(`${item.title} → ${STATUS_LABEL[status]}`)
    })
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
      <div className="grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3">
        {COLUMNS.map((column) => {
          const cards = optimistic.filter((item) => columnOf(item.status) === column.id)
          return (
            <section
              key={column.id}
              aria-label={column.title}
              onDragOver={(event) => {
                if (!dragging) return
                event.preventDefault()
                setOver(column.id)
              }}
              onDragLeave={() => setOver((value) => (value === column.id ? null : value))}
              onDrop={(event) => {
                event.preventDefault()
                setOver(null)
                const id = event.dataTransfer.getData("text/plain")
                const item = optimistic.find((entry) => entry.id === id)
                if (item) move(id, statusForColumn(item.status, column.id))
              }}
              className={cn("flex min-h-64 flex-col gap-2 rounded-xl bg-muted/50 p-2 transition-colors", over === column.id && "bg-muted")}
            >
              <header className="flex items-center justify-between px-1.5 py-1">
                <h2 className="text-sm font-medium">{column.title}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">{cards.length}</span>
              </header>
              {cards.map((item) => (
                <Card
                  key={item.id}
                  size="sm"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", item.id)
                    event.dataTransfer.effectAllowed = "move"
                    setDragging(item.id)
                  }}
                  onDragEnd={() => {
                    setDragging(null)
                    setOver(null)
                  }}
                  className={cn("cursor-grab active:cursor-grabbing", dragging === item.id && "opacity-50")}
                >
                  <CardContent className="grid gap-2">
                    <div className="flex items-start gap-2">
                      <EntryLogo path={item.logoPath} name={item.company} size={28} />
                      <Link href={`/applications/${item.id}`} className="min-w-0 flex-1 hover:underline" draggable={false}>
                        <div className="line-clamp-2 text-sm font-medium">{item.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.company}</div>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label={`Move ${item.title}`} />}>
                          <EllipsisIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>Move to</DropdownMenuLabel>
                            {MANUAL_STATUSES.map((status) => (
                              <DropdownMenuItem key={status} disabled={item.status === status} onClick={() => move(item.id, status)}>
                                {STATUS_LABEL[status]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem render={<Link href={`/applications/${item.id}`} />}>Open</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{STATUS_LABEL[item.status]}</Badge>
                      <span>{age(item.since)}</span>
                      {item.fit !== null ? <FitRing score={item.fit} size={28} className="ml-auto" /> : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!cards.length ? <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">{dragging ? "Drop here" : "Nothing here"}</p> : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
