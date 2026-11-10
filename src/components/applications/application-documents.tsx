import Link from "next/link"
import { ArrowRightIcon, CheckCircle2Icon, FileTextIcon, MailIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useLocale, useTranslations } from "next-intl"

const COVER = { required: "destructive", optional: "secondary", not_requested: "outline", not_mentioned: "outline" } as const

type Draft = { updatedAt: Date } | null

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
  const t = useTranslations("application.documents")
  const locale = useLocale()
  const when = (date: Date) => date.toLocaleDateString(locale, { day: "numeric", month: "short" })
  const base = `/applications/${applicationId}`
  const cover = coverDecision ? { variant: COVER[coverDecision], label: t(`cover.${coverDecision}`) } : null
  const letterMatters = coverDecision === "required" || coverDecision === "optional"
  const items = [
    {
      href: `${base}/cv?lang=${language}`,
      icon: FileTextIcon,
      title: t("cv"),
      hint: cv ? t("saved", { date: when(cv.updatedAt) }) : t("cvHint"),
      badge: cv ? <Badge variant="secondary" className="gap-1"><CheckCircle2Icon /> {t("draft")}</Badge> : null,
      primary: true,
    },
    {
      href: `${base}/letter?lang=${language}`,
      icon: MailIcon,
      title: t("letter"),
      hint: letter ? t("saved", { date: when(letter.updatedAt) }) : coverEvidence ? `“${coverEvidence.slice(0, 90)}${coverEvidence.length > 90 ? "…" : ""}”` : coverDecision === "not_requested" ? t("stillWrite") : t("letterHint"),
      badge: letter ? <Badge variant="secondary" className="gap-1"><CheckCircle2Icon /> {t("draft")}</Badge> : cover ? <Badge variant={cover.variant} className="font-normal">{cover.label}</Badge> : null,
      primary: letterMatters && !letter,
    },
  ]
  return (
    <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
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
          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground rtl:group-hover:-translate-x-0.5" />
        </Link>
      ))}
    </div>
  )
}
