"use client"

import { toast } from "sonner"
import { Otter, type OtterPose } from "@/components/naruvi/otter"
import { STATUS_LABEL, type Status } from "@/lib/stages"

/**
 * What Naruvi says when an application changes stage. Warm, specific and
 * short: real wins get a small celebration, a rejection gets a kind word and
 * a next step, everything else a plain confirmation.
 */
const MOMENTS: Partial<Record<Status, { pose: OtterPose; title: (company: string) => string; body: string }>> = {
  submitted: { pose: "celebrating-progress", title: (company) => `Sent to ${company}`, body: "Nicely done. Unless you planned something else, I’ve set a follow-up for a week from now." },
  interviewing: { pose: "interview-practice", title: (company) => `Interview with ${company}`, body: "They want to talk. Ask me and I’ll gather what’s worth mentioning about them." },
  offer: { pose: "celebrating-progress", title: (company) => `An offer from ${company}`, body: "Take a moment to enjoy this one. When you’re ready, we can look at it together." },
  rejected: { pose: "offering-reassurance", title: (company) => `${company} said no this time`, body: "That stings, and it says little about you. Your other applications are still moving." },
}

export function announceStatus(status: Status, company: string, title: string) {
  const moment = MOMENTS[status]
  if (!moment) return void toast(`${title} → ${STATUS_LABEL[status]}`)
  toast.custom(
    (id) => (
      <div
        role="status"
        onClick={() => toast.dismiss(id)}
        className="flex w-[22rem] max-w-[calc(100vw-2rem)] cursor-default items-end gap-3 overflow-hidden rounded-xl border bg-popover p-3 pe-4 text-popover-foreground shadow-lg"
      >
        <Otter pose={moment.pose} height={76} className="-mb-3 -ms-1" />
        <div className="grid min-w-0 gap-0.5 pb-0.5">
          <p className="text-sm font-medium">{moment.title(company || "them")}</p>
          <p className="text-xs text-muted-foreground">{moment.body}</p>
        </div>
      </div>
    ),
    { duration: status === "rejected" ? 7000 : 5500 },
  )
}
