import Link from "next/link"
import { ArrowRightIcon, CheckIcon, ExternalLinkIcon, FileTextIcon, ScanSearchIcon, SendIcon } from "lucide-react"
import { AnalyzeButton } from "@/components/applications/analyze-button"
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
export function ApplicationProgress({ applicationId, jobId, status: saved, language, spontaneous, sourceUrl, cvDraft = false }: {
  applicationId: string
  jobId: string
  status: Status
  language: string
  spontaneous: boolean
  sourceUrl: string | null
  /** A CV draft already exists, even if the status hasn't moved on. */
  cvDraft?: boolean
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
          ? { title: "Review your CV", body: "Check the draft, then mark it ready.", action: <Button nativeButton={false} render={<Link href={cv} />}><FileTextIcon /> Open CV</Button> }
          : status === "ready"
            ? { title: "Send your application", body: "Apply on the posting, then set the status to Sent so Naruvi can remind you to follow up.", action: sourceUrl ? <Button nativeButton={false} render={<a href={sourceUrl} target="_blank" rel="noreferrer" />}><SendIcon /> Apply on the posting <ExternalLinkIcon /></Button> : null }
            : null

  return (
    <div className={cn("grid gap-3 rounded-xl border p-3 sm:p-4", next && current <= 0 && "border-primary/30 bg-primary/[0.03]")}>
      <ol className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Progress">
        {steps.map((step, position) => {
          const done = !closed && position < index
          const here = !closed && position === index
          return (
            <li key={step.id} className="flex min-w-0 items-center gap-1" aria-current={here ? "step" : undefined}>
              <span
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs whitespace-nowrap transition-colors",
                  done && "text-muted-foreground",
                  here && "bg-primary font-medium text-primary-foreground",
                  !done && !here && "text-muted-foreground/60",
                )}
              >
                <span className={cn("grid size-4 place-content-center rounded-full text-[10px] tabular-nums", done ? "bg-emerald-500 text-white" : here ? "bg-primary-foreground/20" : "border")}>
                  {done ? <CheckIcon className="size-2.5" strokeWidth={3} /> : position + 1}
                </span>
                {step.label}
              </span>
              {position < steps.length - 1 ? <span className={cn("h-px w-4 shrink-0 sm:w-6", done ? "bg-emerald-500/60" : "bg-border")} aria-hidden /> : null}
            </li>
          )
        })}
        {closed ? <li className="ms-2 text-xs text-muted-foreground">{status === "rejected" ? "Closed: not selected" : "Closed: withdrawn"}</li> : null}
      </ol>
      {next ? (
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <span className="grid size-9 shrink-0 place-content-center rounded-lg bg-primary/10 text-primary">
            {status === "draft" || status === "parsed" ? <ScanSearchIcon className="size-4.5" /> : status === "ready" ? <SendIcon className="size-4.5" /> : <FileTextIcon className="size-4.5" />}
          </span>
          <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <span className="text-xs font-normal text-muted-foreground">Next</span> <ArrowRightIcon className="size-3 text-muted-foreground" /> {next.title}
            </p>
            <p className="text-xs text-muted-foreground">{next.body}</p>
          </div>
          {next.action}
        </div>
      ) : null}
    </div>
  )
}
