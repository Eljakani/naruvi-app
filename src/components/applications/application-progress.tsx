import Link from "next/link"
import { ArrowRightIcon, CalendarClockIcon, CheckIcon, ExternalLinkIcon, FileTextIcon, HourglassIcon, MessagesSquareIcon, PartyPopperIcon, ScanSearchIcon, SendIcon, ArchiveIcon, type LucideIcon } from "lucide-react"
import { AnalyzeButton } from "@/components/applications/analyze-button"
import { MoveStatusButton } from "@/components/tracking/status-control"
import { Button } from "@/components/ui/button"
import type { Status } from "@/lib/stages"
import { cn } from "@/lib/utils"

const STEPS = [
  { id: "saved", label: "Saved" },
  { id: "analyzed", label: "Fit checked" },
  { id: "documents", label: "CV & letter" },
  { id: "sent", label: "Sent" },
  { id: "interviewing", label: "Interviews" },
  { id: "offer", label: "Offer" },
] as const

const STEP_OF: Record<Status, number> = { draft: 0, parsed: 0, analyzed: 1, generated: 2, ready: 2, submitted: 3, interviewing: 4, offer: 5, rejected: -1, withdrawn: -1 }

/**
 * Where this application is, as six steps, and the one thing to do next.
 * Shown under the title so the next action is never hidden in a tab.
 */
export function ApplicationProgress({ applicationId, jobId, status: saved, language, spontaneous, sourceUrl, cvDraft = false, nextStep = "", nextStepDue = null, company = "", title = "" }: {
  /** For the status toast when a step is ticked off from here. */
  company?: string
  title?: string
  applicationId: string
  jobId: string
  status: Status
  language: string
  spontaneous: boolean
  sourceUrl: string | null
  /** A CV draft already exists, even if the status hasn't moved on. */
  cvDraft?: boolean
  /** The step you set yourself, if any: it wins over Naruvi's suggestion once the application is out. */
  nextStep?: string
  nextStepDue?: Date | null
}) {
  const status: Status = saved === "analyzed" && cvDraft ? "generated" : saved
  const current = STEP_OF[status]
  const closed = current === -1
  const steps = spontaneous ? STEPS.filter((step) => step.id !== "analyzed") : STEPS
  const index = spontaneous ? (current >= 2 ? current - 1 : Math.max(current, 0)) : current
  const cv = `/applications/${applicationId}/cv?lang=${language}`

  const next = closed
    ? null
    : status === "draft" || status === "parsed"
      ? spontaneous
        ? { title: "Write your CV", body: "No posting to match, so your CV leads with your strongest verified entries.", action: <Button nativeButton={false} render={<Link href={cv} />}><FileTextIcon /> Open CV</Button> }
        : { title: "Check your fit", body: "Naruvi compares each requirement with your verified facts and picks what to lead with. About a minute.", action: <AnalyzeButton jobId={jobId} /> }
      : status === "analyzed"
        ? { title: "Make your CV for this job", body: "Built from the analysis: your best-matching entries first, nothing you can’t back up.", action: <Button nativeButton={false} render={<Link href={cv} />}><FileTextIcon /> Create CV</Button> }
        : status === "generated"
          ? { title: "Review your CV", body: "Check the draft, then mark it ready.", action: <><Button nativeButton={false} render={<Link href={cv} />}><FileTextIcon /> Open CV</Button><MoveStatusButton id={applicationId} to="ready" company={company} title={title} variant="outline"><CheckIcon /> Mark ready</MoveStatusButton></> }
          : status === "ready"
            ? { title: "Send your application", body: "Apply on the posting, then mark it sent so Naruvi can remind you to follow up.", action: <>{sourceUrl ? <Button variant="outline" nativeButton={false} render={<a href={sourceUrl} target="_blank" rel="noreferrer" />}>Apply on the posting <ExternalLinkIcon /></Button> : null}<MoveStatusButton id={applicationId} to="submitted" company={company} title={title}><SendIcon /> Mark as sent</MoveStatusButton></> }
            : null

  // After sending there's no document to make: say what's going on, and surface your own next step if you set one.
  const due = nextStepDue ? nextStepDue.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : null
  const overdue = nextStepDue ? nextStepDue.getTime() < new Date().setHours(0, 0, 0, 0) : false
  const own = nextStep.trim() ? { title: nextStep.trim(), body: due ? `${overdue ? "Overdue since" : "Due"} ${due}. Change it from Add next step above.` : "No date yet. Add one so Naruvi can remind you.", action: null, icon: CalendarClockIcon, tone: overdue ? "warn" as const : undefined } : null
  const later: { title: string; body: string; action: React.ReactNode; icon: LucideIcon; tone?: "warn" | "good" } | null = closed
    ? { title: saved === "rejected" ? "This one didn’t work out" : "You withdrew from this one", body: "It stays here for reference. What you learned still counts: your verified facts carry over to the next application.", action: null, icon: ArchiveIcon }
    : status === "submitted"
      ? own ?? { title: "Waiting to hear back", body: "Naruvi watches your inbox for their reply. No news in a week? Set a follow-up with Add next step.", action: null, icon: HourglassIcon }
      : status === "interviewing"
        ? own ?? { title: "Prepare for your interview", body: "Go over your proven strengths and the company talking points from the fit check.", action: <Button variant="outline" nativeButton={false} render={<Link href={`/applications/${applicationId}`} scroll={false} />}><MessagesSquareIcon /> Talking points</Button>, icon: MessagesSquareIcon }
        : status === "offer"
          ? own ?? { title: "You have an offer", body: "Take your time. Ask Naruvi to compare it with your other applications before you decide.", action: null, icon: PartyPopperIcon, tone: "good" }
          : null

  const panel = next
    ? { ...next, icon: status === "draft" || status === "parsed" ? ScanSearchIcon : status === "ready" ? SendIcon : FileTextIcon, tone: undefined, kicker: "Next" }
    : later
      ? { ...later, kicker: closed ? null : own && later === own ? "Your next step" : "Now" }
      : null
  // The track runs from the first node's centre to the last; the fill reaches the current step.
  const fill = closed ? 0 : (index / (steps.length - 1)) * 100

  return (
    <div className={cn("flex flex-col justify-center gap-4 rounded-xl border bg-card p-3 sm:p-4", next && current <= 0 && "border-brand/30 bg-brand-soft/50")}>
      <div>
        <p className="mb-3 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Progress</span>
          <span className="tabular-nums">{closed ? (status === "rejected" ? "Closed: not selected" : "Closed: withdrawn") : `Step ${index + 1} of ${steps.length}`}</span>
        </p>
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Application progress">
          <span aria-hidden className="absolute top-3 h-0.5 -translate-y-1/2 rounded-full bg-border" style={{ insetInline: `calc(100% / ${steps.length * 2})` }}>
            <span className="block h-full rounded-full bg-emerald-500 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${fill}%` }} />
          </span>
          {steps.map((step, position) => {
            const done = !closed && position < index
            const here = !closed && position === index
            return (
              <li key={step.id} className="relative flex min-w-0 flex-col items-center gap-1.5 text-center" aria-current={here ? "step" : undefined}>
                <span
                  className={cn(
                    "relative grid size-6 place-content-center rounded-full text-[11px] font-medium tabular-nums transition-[background-color,box-shadow,color] duration-300 motion-reduce:transition-none",
                    done && "bg-emerald-500 text-white",
                    here && "bg-brand text-brand-foreground ring-4 ring-brand/20",
                    !done && !here && "border bg-card text-muted-foreground",
                  )}
                >
                  {here ? <span aria-hidden className="absolute inset-0 rounded-full bg-brand/40 motion-safe:animate-ping motion-safe:[animation-duration:2.4s]" /> : null}
                  <span aria-hidden className="relative">{done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : position + 1}</span>
                </span>
                <span className={cn("text-[11px] leading-tight text-balance sm:text-xs", here ? "font-medium text-foreground" : done ? "text-foreground/70" : "text-muted-foreground")}>
                  {step.label}
                  <span className="sr-only">{done ? " (done)" : here ? " (current)" : ""}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      {panel ? (
        <div key={status} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
          <span className={cn("grid size-9 shrink-0 place-content-center rounded-lg", panel.tone === "warn" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : panel.tone === "good" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : closed ? "bg-muted text-muted-foreground" : "bg-brand/10 text-brand")}>
            <panel.icon className="size-4.5" />
          </span>
          <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
            <p className="flex items-center gap-1.5 text-sm font-medium [overflow-wrap:anywhere]">
              {panel.kicker ? <><span className="text-xs font-normal text-muted-foreground">{panel.kicker}</span> <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" /></> : null} {panel.title}
            </p>
            <p className="text-xs text-pretty text-muted-foreground">{panel.body}</p>
          </div>
          {panel.action ? <div className="flex flex-wrap gap-2">{panel.action}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
