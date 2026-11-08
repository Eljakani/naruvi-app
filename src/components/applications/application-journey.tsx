import { CheckIcon, XIcon } from "lucide-react"
import { STATUS_LABEL, type Status } from "@/lib/stages"
import { cn } from "@/lib/utils"

type Event = { id: string; fromStatus: Status | null; toStatus: Status; actor: string; createdAt: Date }
type Step = { id: string; label: string; date: Date; note: string; status?: Status; auto?: number }

const SHOWN = 6
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/**
 * Collapses noise: automatic status changes in a row on the same day become one
 * step (the one it ended on), and repeating a step that's already shown is skipped.
 */
function condense(createdAt: Date, events: Event[]): Step[] {
  const steps: Step[] = [{ id: "saved", label: "Saved", date: createdAt, note: "" }]
  let run = 0
  for (const event of [...events].reverse()) {
    const step: Step = { id: event.id, label: STATUS_LABEL[event.toStatus], date: event.createdAt, note: event.actor === "system" ? "automatic" : "", status: event.toStatus, auto: event.actor === "system" ? 1 : 0 }
    const previous = steps.at(-1)!
    if (step.note && previous.note && sameDay(step.date, previous.date)) {
      run += 1
      steps[steps.length - 1] = { ...step, note: `automatic · ${run + 1} changes`, auto: run + 1 }
      continue
    }
    run = 0
    if (previous.label === step.label && sameDay(step.date, previous.date)) continue
    steps.push(step)
  }
  return steps
}

/**
 * The application's own story, oldest first: when it was saved, then every
 * stage it reached, with dates. Vertical beside the emails; horizontal (a
 * strip across the column) when it closes the fit check.
 */
export function ApplicationJourney({ createdAt, events, className, layout = "vertical" }: { createdAt: Date; events: Event[]; className?: string; layout?: "vertical" | "horizontal" }) {
  const all = condense(createdAt, events)
  const hidden = Math.max(0, all.length - SHOWN)
  const steps = all.slice(hidden)
  const day = (date: Date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
  // Closed stages read as closed (rose ✕), not as another green tick.
  const dot = (last: boolean, status?: Status) => {
    const closed = status === "rejected" || status === "withdrawn"
    return (
      <span className={cn("relative grid size-5 shrink-0 place-content-center rounded-full", closed ? "bg-rose-500 text-white" : last ? "bg-brand text-brand-foreground ring-4 ring-brand/15" : "bg-emerald-500 text-white", closed && last && "ring-4 ring-rose-500/15")} aria-hidden>
        {closed ? <XIcon className="size-3" strokeWidth={3} /> : last ? <span className="size-1.5 rounded-full bg-brand-foreground" /> : <CheckIcon className="size-3" strokeWidth={3} />}
      </span>
    )
  }
  const earlier = hidden ? (
    <details className="group text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{hidden} earlier {hidden === 1 ? "step" : "steps"}</summary>
      <ul className="mt-2 grid gap-1">
        {all.slice(0, hidden).map((step) => <li key={step.id} className="flex justify-between gap-3"><span>{step.label}{step.note ? ` · ${step.note}` : ""}</span><time className="tabular-nums" dateTime={step.date.toISOString()}>{day(step.date)}</time></li>)}
      </ul>
    </details>
  ) : null

  if (layout === "horizontal") {
    return (
      <section className={cn("grid gap-4 rounded-xl border p-4", className)} aria-labelledby="journey-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="journey-title" className="text-sm font-semibold">Journey</h2>
          <span className="text-xs text-muted-foreground">Since {day(createdAt)} · {all.length} {all.length === 1 ? "step" : "steps"}</span>
        </div>
        {hidden ? (
          // Earlier steps open above the strip, in the same order, so the story still reads left to right.
          <details className="-mt-2 text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Show {hidden} earlier</summary>
            <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {all.slice(0, hidden).map((step) => <li key={step.id} className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-muted-foreground/40" aria-hidden />{step.label}<time className="tabular-nums" dateTime={step.date.toISOString()}>{day(step.date)}</time></li>)}
            </ol>
          </details>
        ) : null}
        {/* One row: steps stretch across the width, and the row scrolls sideways when it's narrow (no lone step on a second line). */}
        <ol className="-mx-1 grid auto-cols-[minmax(6.5rem,1fr)] grid-flow-col overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:thin]">
          {steps.map((step, index) => {
            const last = index === steps.length - 1
            return (
              <li key={step.id} className="grid content-start gap-1.5">
                <div className="flex items-center">
                  {dot(last, step.status)}
                  {!last ? <span className="mx-2 h-px flex-1 bg-border" aria-hidden /> : null}
                </div>
                <span className={cn("truncate pe-2 text-sm leading-5", last ? "font-medium" : "text-muted-foreground")} title={step.label}>{step.label}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <time className="tabular-nums" dateTime={step.date.toISOString()} title={step.date.toLocaleString()}>{day(step.date)}</time>
                  {step.auto ? <span className="rounded bg-muted px-1 text-[10px] leading-4" title={step.auto > 1 ? `${step.auto} automatic changes that day` : "Changed automatically"}>auto{step.auto > 1 ? ` ×${step.auto}` : ""}</span> : null}
                </span>
              </li>
            )
          })}
        </ol>
      </section>
    )
  }

  return (
    <section className={cn("grid gap-3 rounded-xl border p-4", className)} aria-labelledby="journey-title">
      <h2 id="journey-title" className="text-sm font-semibold">Journey</h2>
      {earlier}
      <ol className="grid">
        {steps.map((step, index) => {
          const last = index === steps.length - 1
          return (
            <li key={step.id} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-2.5 pb-3 last:pb-0">
              {!last ? <span className="absolute start-[0.59rem] top-5 bottom-0 w-px bg-border" aria-hidden /> : null}
              <span className="mt-0.5">{dot(last, step.status)}</span>
              <span className={cn("min-w-0 text-sm leading-6", last ? "font-medium" : "text-muted-foreground")}>
                {step.label}
                {step.note ? <span className="text-xs text-muted-foreground"> · {step.note}</span> : null}
              </span>
              <time className="text-xs leading-6 text-muted-foreground tabular-nums" dateTime={step.date.toISOString()} title={step.date.toLocaleString()}>{day(step.date)}</time>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
