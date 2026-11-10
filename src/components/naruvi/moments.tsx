"use client"

import { toast } from "sonner"
import { Otter, type OtterPose } from "@/components/naruvi/otter"
import type { Status } from "@/lib/stages"
import { useTranslations } from "next-intl"

/**
 * What Naruvi says when an application changes stage. Warm, specific and
 * short: real wins get a small celebration, a rejection gets a kind word and
 * a next step, everything else a plain confirmation.
 */
const MOMENTS = { submitted: "celebrating-progress", interviewing: "interview-practice", offer: "celebrating-progress", rejected: "offering-reassurance" } as const satisfies Partial<Record<Status, OtterPose>>
type Moment = keyof typeof MOMENTS

/** Toasts render inside the intl provider, so their text is translated where it's shown. */
function StatusMoved({ status, title }: { status: Status; title: string }) {
  const t = useTranslations("labels")
  return <>{title} → {t(`status.${status}`)}</>
}

function MomentText({ status, company }: { status: Moment; company: string }) {
  const t = useTranslations("moments")
  return (
    <>
      <p className="text-sm font-medium">{t(`${status}.title`, { company: company || t("them") })}</p>
      <p className="text-xs text-muted-foreground">{t(`${status}.body`)}</p>
    </>
  )
}

export function announceStatus(status: Status, company: string, title: string) {
  if (!(status in MOMENTS)) return void toast(<StatusMoved status={status} title={title} />)
  const moment = { pose: MOMENTS[status as Moment] }
  toast.custom(
    (id) => (
      <div
        role="status"
        onClick={() => toast.dismiss(id)}
        className="flex w-[22rem] max-w-[calc(100vw-2rem)] cursor-default items-end gap-3 overflow-hidden rounded-xl border bg-popover p-3 pe-4 text-popover-foreground shadow-lg"
      >
        <Otter pose={moment.pose} height={76} className="-mb-3 -ms-1" />
        <div className="grid min-w-0 gap-0.5 pb-0.5">
          <MomentText status={status as Moment} company={company} />
        </div>
      </div>
    ),
    { duration: status === "rejected" ? 7000 : 5500 },
  )
}
