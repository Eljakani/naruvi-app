import { InboxIcon } from "lucide-react"
import { InterviewCalendar } from "@/components/mail/interview-calendar"
import { MailMessage } from "@/components/mail/mail-message"
import { ComposeEmail } from "@/components/mail/compose-email"
import { SuggestionActions } from "@/components/mail/suggestion-actions"
import { NaruviAvatar, Otter } from "@/components/naruvi/otter"
import { shouldOfferInterviewCalendar } from "@/lib/interview-calendar"
import type { Status } from "@/lib/stages"
import type { mailFor } from "@/server/mail/classify"
import { useTranslations } from "next-intl"

type Message = Awaited<ReturnType<typeof mailFor>>[number]

const normalize = (subject: string) => subject.replace(/^((re|fwd?|tr)\s*:\s*)+/i, "").trim().toLowerCase()

/** The conversation with the company: newest first, Naruvi's suggestion on top, one Reply for the latest email. */
export function MailThread({ messages, applicationId, connected, status }: { messages: Message[]; applicationId: string; connected: boolean; status: string }) {
  const t = useTranslations("mail")
  const tl = useTranslations("labels")
  if (!messages.length) return null
  const ordered = [...messages].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
  const open = ordered.find((message) => message.suggestionState === "pending")
  const latestIn = ordered.find((message) => message.direction === "in")
  const subject = normalize(ordered[0].subject ?? "")
  const unread = ordered.filter((message) => message.direction === "in" && !message.readAt).length
  const goodNews = latestIn?.kind === "interview" || latestIn?.kind === "offer"
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="conversation-title">
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5">
        <InboxIcon className="size-4 text-muted-foreground" aria-hidden />
        <div className="grid min-w-0 flex-1">
          <h2 id="conversation-title" className="truncate text-sm font-semibold">{ordered[0].subject ? ordered[0].subject.replace(/^((re|fwd?|tr)\s*:\s*)+/i, "") : t("conversation")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("messages", { count: messages.length })}
            {unread ? <span className="font-medium text-brand"> · {t("newCount", { count: unread })}</span> : null}
          </p>
        </div>
        {latestIn ? <ComposeEmail applicationId={applicationId} connected={connected} hasReplies replyToId={latestIn.id} /> : null}
      </header>

      {open?.suggestion ? (
        <div className="flex flex-wrap items-center gap-3 border-b bg-gradient-to-r from-brand-soft/60 to-transparent px-5 py-3">
          {goodNews ? <Otter pose="good-news-mail" height={56} className="-my-1" /> : <NaruviAvatar size={32} />}
          <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
            <p className="text-sm"><span className="font-medium text-brand">Naruvi · </span>{open.suggestion.nextStep || open.suggestion.summary}</p>
            {open.suggestion.status ? <p className="text-xs text-muted-foreground">{t("canMove", { status: tl(`status.${open.suggestion.status as Status}`) })}</p> : null}
          </div>
          <SuggestionActions messageId={open.id} label={t("updateApplication")} />
        </div>
      ) : null}

      {shouldOfferInterviewCalendar(ordered[0], !["offer", "rejected", "withdrawn"].includes(status) && latestIn?.kind === "interview") ? (
        <div className="border-b px-5 py-3">
          <InterviewCalendar key={ordered[0].id} applicationId={applicationId} messageId={ordered[0].id} />
        </div>
      ) : null}

      <ol className="divide-y">
        {ordered.map((message, index) => (
          <MailMessage
            key={message.id}
            applicationId={applicationId}
            connected={connected}
            initiallyOpen={index === 0}
            sameSubject={normalize(message.subject ?? "") === subject}
            message={{ id: message.id, direction: message.direction, fromName: message.fromName, fromAddress: message.fromAddress, toAddresses: message.toAddresses, sentAt: message.sentAt, readAt: message.readAt, subject: message.subject ?? "", text: message.text ?? "", kind: message.kind, matchReason: message.matchReason }}
          />
        ))}
      </ol>
    </section>
  )
}
