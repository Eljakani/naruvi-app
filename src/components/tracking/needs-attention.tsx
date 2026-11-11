import Link from "next/link"
import { ArrowRightIcon, CalendarClockIcon, InboxIcon, FileTextIcon, HourglassIcon, SendIcon, type LucideIcon } from "lucide-react"
import { EntryLogo } from "@/components/profile/entry-logo"
import { SuggestionActions } from "@/components/mail/suggestion-actions"
import { ArchiveButton } from "@/components/tracking/next-step"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { dueTone, type AttentionItem, type AttentionReason } from "@/lib/attention"
import { cn } from "@/lib/utils"
import { useLocale, useTranslations } from "next-intl"
import { dueLabel } from "@/lib/attention"

const REASON: Record<AttentionReason, LucideIcon> = { due: CalendarClockIcon, ready: SendIcon, quiet: HourglassIcon, "strong-fit": FileTextIcon }

const LIMIT = 6

/** The short list of applications that need you today, most urgent first. */
type Reply = { id: string; applicationId: string | null; subject: string; fromName: string; fromAddress: string; kind: string | null; suggestion: { summary?: string } | null; title: string; company: string | null; logoPath: string | null }

export function NeedsAttention({ items, now, replies = [] }: { items: AttentionItem[]; now: number; replies?: Reply[] }) {
  const repliedTo = new Set(replies.map((reply) => reply.applicationId))
  items = items.filter((item) => !repliedTo.has(item.id))
  const actionCount = items.length + replies.length
  const t = useTranslations("attention")
  const tl = useTranslations("labels")
  const locale = useLocale()
  if (!actionCount) return null
  const message = (item: AttentionItem) =>
    item.reason === "due" && item.nextStepDue ? `${item.nextStep || t("nextStep")} · ${dueLabel(item.nextStepDue, now, (key, values) => tl(`due.${key}`, values), locale)}`
    : item.reason === "ready" ? (item.idleDays >= 1 ? t("message.readyIdle", { count: item.idleDays }) : t("message.ready"))
    : item.reason === "quiet" ? t("message.quiet", { count: item.idleDays })
    : item.reason === "strong-fit" ? t("message.strongFit", { fit: item.fit ?? 0, count: item.idleDays })
    : item.message
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("count", { count: actionCount })}</CardDescription>
        {items.length > LIMIT ? (
          <CardAction>
            <Button size="sm" variant="ghost" nativeButton={false} render={<Link href="/applications?view=list" />}>
              {t("all")} <ArrowRightIcon />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {replies.length ? (
          <div className="grid gap-1.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <InboxIcon className="size-3.5" /> {t("newReplies")}
            </p>
            <ul className="divide-y rounded-lg border">
              {replies.map((reply) => (
                <li key={reply.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                  <EntryLogo path={reply.logoPath} name={reply.company || "?"} size={32} />
                  <Link href={`/applications/${reply.applicationId}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:underline">{reply.suggestion?.summary ?? reply.subject}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {t("replyFrom", { title: reply.title, subject: reply.subject, from: reply.fromName || reply.fromAddress })}
                    </span>
                  </Link>
                  <SuggestionActions messageId={reply.id} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {items.length ? (
          <ul className="divide-y rounded-lg border">
            {items.slice(0, LIMIT).map((item) => {
              const ReasonIcon = REASON[item.reason]
              const overdue = item.reason === "due" && item.nextStepDue && dueTone(item.nextStepDue, now) === "overdue"
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                  <EntryLogo path={item.logoPath} name={item.company || "?"} size={32} />
                  <Link href={`/applications/${item.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium hover:underline">{item.title}{item.company ? <span className="font-normal text-muted-foreground"> · {item.company}</span> : null}</span>
                    <span className={cn("flex min-w-0 items-center gap-1 text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                      <ReasonIcon className="size-3 shrink-0" aria-label={t(`reason.${item.reason}`)} />
                      <span className="truncate">{message(item)}</span>
                    </span>
                  </Link>
                  <div className="flex shrink-0 gap-1">
                    {item.action === "archive" ? <ArchiveButton id={item.id} archived={false} size="sm" /> : null}
                    <Button size="sm" variant={item.action === "archive" ? "ghost" : "outline"} nativeButton={false} render={<Link href={item.action === "cv" ? `/applications/${item.id}/cv` : `/applications/${item.id}`} />}>
                      {item.action === "cv" ? t("draftCv") : t("open")}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
