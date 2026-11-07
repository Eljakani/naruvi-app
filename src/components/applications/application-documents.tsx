import Link from "next/link"
import { ArrowRightIcon, CheckCircle2Icon, FileTextIcon, MailIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const COVER = {
  required: { label: "Required by the posting", variant: "destructive" },
  optional: { label: "Optional", variant: "secondary" },
  not_requested: { label: "Not needed", variant: "outline" },
  not_mentioned: { label: "Not mentioned", variant: "outline" },
} as const

type Draft = { updatedAt: Date } | null
const when = (date: Date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short" })

/**
 * The two things you came here to make, right under the title: the tailored CV
 * and the cover letter, with whether a draft already exists.
 */
export function ApplicationDocuments({ applicationId, language, coverDecision, coverEvidence, cv, letter }: {
  applicationId: string
  language: string
  coverDecision: keyof typeof COVER | null
  coverEvidence?: string | null
  cv: Draft
  letter: Draft
}) {
  const base = `/applications/${applicationId}`
  const cover = coverDecision ? COVER[coverDecision] : null
  const letterMatters = coverDecision === "required" || coverDecision === "optional"
  const items = [
    {
      href: `${base}/cv?lang=${language}`,
      icon: FileTextIcon,
      title: "Tailored CV",
      hint: cv ? `Draft saved ${when(cv.updatedAt)}` : "Built from your verified entries, ordered for this job",
      badge: cv ? <Badge variant="secondary" className="gap-1"><CheckCircle2Icon /> Draft</Badge> : null,
      primary: true,
    },
    {
      href: `${base}/letter?lang=${language}`,
      icon: MailIcon,
      title: "Cover letter",
      hint: letter ? `Draft saved ${when(letter.updatedAt)}` : coverEvidence ? `“${coverEvidence.slice(0, 90)}${coverEvidence.length > 90 ? "…" : ""}”` : coverDecision === "not_requested" ? "You can still write one" : "Written from your facts and their site",
      badge: letter ? <Badge variant="secondary" className="gap-1"><CheckCircle2Icon /> Draft</Badge> : cover ? <Badge variant={cover.variant} className="font-normal">{cover.label}</Badge> : null,
      primary: letterMatters && !letter,
    },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link
          key={item.title}
          href={item.href}
          className={cn(
            "group flex items-center gap-3 rounded-xl border p-3 transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-muted/50 active:scale-[0.99]",
            item.primary && "border-primary/40 bg-primary/[0.03]",
          )}
        >
          <span className={cn("grid size-10 shrink-0 place-content-center rounded-lg", item.primary ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
            <item.icon className="size-5" />
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {item.title} {item.badge}
            </span>
            <span className="truncate text-xs text-muted-foreground" title={item.hint}>{item.hint}</span>
          </span>
          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      ))}
    </div>
  )
}
