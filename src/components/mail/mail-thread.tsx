import { InboxIcon, SparklesIcon } from "lucide-react"
import { SuggestionActions } from "@/components/mail/suggestion-actions"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { KIND_LABEL, type MailKind } from "@/lib/mail-classify"
import { STATUS_LABEL, type Status } from "@/lib/stages"
import { cn } from "@/lib/utils"
import type { mailFor } from "@/server/mail/classify"

type Message = Awaited<ReturnType<typeof mailFor>>[number]

const TONE: Partial<Record<MailKind, "default" | "destructive" | "secondary" | "outline">> = { rejection: "destructive", interview: "default", offer: "default" }

/** Emails linked to one application, newest first; bodies are shown as plain text only. */
export function MailThread({ messages }: { messages: Message[] }) {
  if (!messages.length) return null
  const ordered = [...messages].reverse()
  const open = ordered.find((message) => message.suggestionState === "pending")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <InboxIcon className="size-4" /> Emails
        </CardTitle>
        <CardDescription>{messages.length} email{messages.length === 1 ? "" : "s"} about this application, from your connected mailbox.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {open?.suggestion ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
            <SparklesIcon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{open.suggestion.summary}</p>
              <p className="text-xs text-muted-foreground">
                {[open.suggestion.status && `Stage → ${STATUS_LABEL[open.suggestion.status as Status]}`, open.suggestion.nextStep && `Next step: ${open.suggestion.nextStep}`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <SuggestionActions messageId={open.id} />
          </div>
        ) : null}
        <ol className="divide-y rounded-lg border">
          {ordered.map((message, index) => (
            <li key={message.id}>
              <details className="group" open={index === 0}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                  <span className={cn("min-w-0 flex-1 truncate text-sm", !message.readAt && message.direction === "in" && "font-semibold")}>{message.subject || "(no subject)"}</span>
                  {message.kind && message.kind !== "other" ? <Badge variant={TONE[message.kind as MailKind] ?? "secondary"}>{KIND_LABEL[message.kind as MailKind]}</Badge> : null}
                  <span className="w-full text-xs text-muted-foreground sm:w-auto">
                    {message.direction === "out" ? "You" : message.fromName || message.fromAddress} · {message.sentAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </summary>
                <div className="grid gap-2 border-t bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">
                    From {message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress} · {message.matchReason}
                  </p>
                  <p className="max-h-96 overflow-y-auto text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text || "(no text)"}</p>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
