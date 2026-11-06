"use client"

import { useState, useTransition } from "react"
import { ArchiveIcon, ArchiveRestoreIcon, CalendarClockIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { archiveApplicationAction, archiveManyAction, setNextStepAction } from "@/app/(app)/applications/actions"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { DUE_PRESETS, dueIn, dueLabel, dueTone } from "@/lib/attention"
import { cn } from "@/lib/utils"

const SUGGESTIONS = ["Follow up if there is no reply", "Prepare for the interview", "Send thank-you note", "Answer the offer"]

const toDateInput = (date: Date | null) => (date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "")
const fromDateInput = (value: string) => {
  if (!value) return null
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, m - 1, d, 18)
}

/** "Next step" with a due date: shown as a chip, edited in a small popover. */
export function NextStep({ id, nextStep, due, size = "default" }: { id: string; nextStep: string; due: string | null; size?: "default" | "sm" }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(nextStep)
  const [date, setDate] = useState(toDateInput(due ? new Date(due) : null))
  const [pending, startTransition] = useTransition()
  const current = due ? new Date(due) : null
  const [now] = useState(() => Date.now())
  const tone = current ? dueTone(current, now) : null

  const save = (nextText: string, nextDate: Date | null) =>
    startTransition(async () => {
      const result = await setNextStepAction(id, nextText, nextDate ? nextDate.toISOString() : null)
      if (!result.ok) toast.error(result.message ?? "Couldn’t save the next step")
      else setOpen(false)
    })

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (value) {
          setText(nextStep)
          setDate(toDateInput(current))
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size={size}
            className={cn("max-w-72", tone === "overdue" && "border-destructive/40 text-destructive", tone === "soon" && "border-foreground/30")}
          />
        }
      >
        {pending ? <Loader2Icon className="animate-spin" /> : <CalendarClockIcon />}
        <span className="truncate">{nextStep || current ? `${nextStep || "Next step"}${current ? ` · ${dueLabel(current, now)}` : ""}` : "Add next step"}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Next step</PopoverTitle>
          <PopoverDescription>What you plan to do and when. It shows on the board and on your dashboard when it’s due.</PopoverDescription>
        </PopoverHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            save(text, fromDateInput(date))
          }}
        >
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor={`next-${id}`}>What</FieldLabel>
              <Input id={`next-${id}`} value={text} maxLength={200} placeholder="Follow up with the recruiter" onChange={(event) => setText(event.target.value)} list={`next-suggestions-${id}`} />
              <datalist id={`next-suggestions-${id}`}>{SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
            </Field>
            <Field>
              <FieldLabel htmlFor={`due-${id}`}>When</FieldLabel>
              <Input id={`due-${id}`} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <div className="flex flex-wrap gap-1">
                {DUE_PRESETS.map((preset) => (
                  <Button key={preset.days} type="button" size="xs" variant="secondary" onClick={() => setDate(toDateInput(dueIn(preset.days, Date.now())))}>
                    {preset.label}
                  </Button>
                ))}
              </div>
            </Field>
          </FieldGroup>
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={pending || (!nextStep && !current)} onClick={() => save("", null)}>
              Clear
            </Button>
            <Button type="submit" size="sm" disabled={pending || (!text.trim() && !date)}>
              {pending ? <Loader2Icon className="animate-spin" /> : null} Save
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** Archive hides an application from the board and dashboard; restore brings it back. */
export function ArchiveButton({ id, archived, size = "default" }: { id: string; archived: boolean; size?: "default" | "sm" }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      size={size}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await archiveApplicationAction(id, !archived)
          if (!result.ok) toast.error(result.message ?? "Couldn’t update the application")
          else toast(archived ? "Application restored" : "Application archived", archived ? undefined : { description: "Find it under Archived on the Applications page.", action: { label: "Undo", onClick: () => void archiveApplicationAction(id, false) } })
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />} {archived ? "Restore" : "Archive"}
    </Button>
  )
}

/** Archive every closed application at once. */
export function ArchiveAllButton({ ids }: { ids: string[] }) {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || !ids.length}
      onClick={() =>
        startTransition(async () => {
          const result = await archiveManyAction(ids)
          if (!result.ok) toast.error(result.message ?? "Couldn’t archive them")
          else toast(`${ids.length} application${ids.length === 1 ? "" : "s"} archived`)
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <ArchiveIcon />} Archive all {ids.length}
    </Button>
  )
}
