import { CheckIcon } from "lucide-react"
import { STATUS_LABEL, type Status } from "@/lib/stages"
import { cn } from "@/lib/utils"

type Event = { id: string; fromStatus: Status | null; toStatus: Status; actor: string; createdAt: Date }

/**
 * The application's own story, oldest first: when it was saved, then every
 * stage it reached, with dates. Sits beside the emails so the two read
 * together ("they wrote on the 6th, interview since the 7th").
 */
export function ApplicationJourney({ createdAt, events, className }: { createdAt: Date; events: Event[]; className?: string }) {
  const steps = [
    { id: "saved", label: "Saved", date: createdAt, note: "" },
    ...[...events].reverse().map((event) => ({ id: event.id, label: STATUS_LABEL[event.toStatus], date: event.createdAt, note: event.actor === "system" ? "automatic" : "" })),
  ]
  const day = (date: Date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
  return (
    <section className={cn("grid gap-3 rounded-xl border p-4", className)} aria-labelledby="journey-title">
      <h2 id="journey-title" className="text-sm font-semibold">Journey</h2>
      <ol className="grid">
        {steps.map((step, index) => {
          const last = index === steps.length - 1
          return (
            <li key={step.id} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-2.5 pb-3 last:pb-0">
              {!last ? <span className="absolute start-[0.59rem] top-5 bottom-0 w-px bg-border" aria-hidden /> : null}
              <span className={cn("relative mt-0.5 grid size-5 place-content-center rounded-full", last ? "bg-brand text-brand-foreground ring-4 ring-brand/15" : "bg-emerald-500 text-white")} aria-hidden>
                {last ? <span className="size-1.5 rounded-full bg-brand-foreground" /> : <CheckIcon className="size-3" strokeWidth={3} />}
              </span>
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
