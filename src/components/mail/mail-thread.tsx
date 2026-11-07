import { ArrowDownLeftIcon, ArrowUpRightIcon, ChevronDownIcon, InboxIcon } from "lucide-react"
import { InterviewCalendar } from "@/components/mail/interview-calendar"
import { shouldOfferInterviewCalendar } from "@/lib/interview-calendar"
import { ComposeEmail } from "@/components/mail/compose-email"
import { SuggestionActions } from "@/components/mail/suggestion-actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KIND_LABEL, type MailKind } from "@/lib/mail-classify"
import { STATUS_LABEL, type Status } from "@/lib/stages"
import { cn } from "@/lib/utils"
import type { mailFor } from "@/server/mail/classify"

type Message = Awaited<ReturnType<typeof mailFor>>[number]

/** Readable correspondence, with original messages and reply context kept together. */
export function MailThread({ messages, applicationId, connected, status }: { messages: Message[]; applicationId: string; connected: boolean; status: string }) {
  if (!messages.length) return null
  const ordered = [...messages].sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
  const open = ordered.find((message) => message.suggestionState === "pending")
  return <Card className="gap-0 overflow-hidden">
    <CardHeader className="gap-1 pb-4">
      <CardTitle className="flex items-center gap-2"><InboxIcon className="size-4 text-muted-foreground" /> Conversation</CardTitle>
      <CardDescription>{messages.length} message{messages.length === 1 ? "" : "s"} · Newest first</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4 px-0 pb-0">
      {shouldOfferInterviewCalendar(ordered[0], !["offer", "rejected", "withdrawn"].includes(status) && ordered.find((message) => message.direction === "in")?.kind === "interview") ? <div className="mx-5"><InterviewCalendar key={ordered[0].id} applicationId={applicationId} messageId={ordered[0].id} /></div> : null}
      {open?.suggestion ? <div className="mx-5 flex flex-wrap items-center gap-3 rounded-lg bg-muted px-4 py-3">
        <div className="grid min-w-0 flex-1 gap-1"><p className="text-sm font-medium">Suggested next step</p><p className="text-sm">{open.suggestion.nextStep || open.suggestion.summary}</p>{open.suggestion.status ? <p className="text-xs text-muted-foreground">Update application to {STATUS_LABEL[open.suggestion.status as Status]}</p> : null}</div><SuggestionActions messageId={open.id} label="Update application" />
      </div> : null}
      <ol className="divide-y border-t">
        {ordered.map((message, index) => {
          const outgoing = message.direction === "out"
          const sender = outgoing ? "You" : message.fromName || message.fromAddress || "Unknown sender"
          const initials = sender.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()
          return <li key={message.id}>
            <details className="group" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium", outgoing && "bg-secondary")}>{outgoing ? <ArrowUpRightIcon className="size-4" /> : initials}</span>
                <span className="grid min-w-0 flex-1 gap-1.5">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className={cn("min-w-0 truncate text-sm font-medium", !message.readAt && !outgoing && "font-semibold")}>{sender}</span><time dateTime={message.sentAt.toISOString()} className="ms-auto text-xs text-muted-foreground">{message.sentAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></span>
                  <span className="flex min-w-0 items-start gap-2"><span className="min-w-0 flex-1 text-sm leading-relaxed [overflow-wrap:anywhere]">{message.subject || "No subject"}</span>{outgoing ? <Badge variant="outline" className="shrink-0">Sent</Badge> : message.kind && message.kind !== "other" && Object.hasOwn(KIND_LABEL, message.kind) ? <Badge variant={message.kind === "rejection" ? "destructive" : "secondary"} className="shrink-0">{KIND_LABEL[message.kind as MailKind]}</Badge> : null}</span>
                  <span className="truncate text-xs text-muted-foreground group-open:hidden">{message.text.replace(/\s+/g, " ").slice(0, 180) || "No message text"}</span>
                </span>
                <ChevronDownIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
              </summary>
              <div className="grid min-w-0 gap-5 px-5 pb-5 sm:ps-17">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><p className="min-w-0 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{outgoing ? <>To {message.toAddresses.join(", ")}</> : <>From <span className="text-foreground">{message.fromAddress}</span><br />To {message.toAddresses.join(", ")}</>}</p>{!outgoing ? <ComposeEmail applicationId={applicationId} connected={connected} hasReplies replyToId={message.id} /> : null}</div>
                <div dir="auto" className="max-w-[70ch] text-sm leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text || "This email has no readable text."}</div>
                {!outgoing && message.matchReason ? <details className="text-xs text-muted-foreground"><summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 hover:text-foreground"><ArrowDownLeftIcon className="size-3" /> Why this email is linked</summary><p className="mt-2 leading-relaxed">{message.matchReason}</p></details> : null}
              </div>
            </details>
          </li>
        })}
      </ol>
    </CardContent>
  </Card>
}
