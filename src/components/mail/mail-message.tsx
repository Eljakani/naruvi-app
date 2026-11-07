"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUpRightIcon, ChevronDownIcon, LinkIcon, MessageSquareQuoteIcon } from "lucide-react"
import { ComposeEmail } from "@/components/mail/compose-email"
import { KIND_LABEL, type MailKind } from "@/lib/mail-classify"
import { splitQuoted } from "@/lib/mail-quote"
import { cn } from "@/lib/utils"

export type ThreadMessage = {
  id: string
  direction: string
  fromName: string | null
  fromAddress: string | null
  toAddresses: string[]
  sentAt: Date
  readAt: Date | null
  subject: string
  text: string
  kind: string | null
  matchReason: string | null
}

const EASE = [0.23, 1, 0.32, 1] as const

const KIND_TONE: Partial<Record<MailKind, string>> = {
  interview: "bg-brand-soft text-brand ring-brand/25",
  offer: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900",
  rejection: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900",
  info_request: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
}

function when(date: Date) {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  if (days < 1 && new Date().getDate() === date.getDate()) return `Today, ${time}`
  if (days < 2) return `Yesterday, ${time}`
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(days > 300 ? { year: "numeric" } : {}) })
}

/** One email in the conversation: a one-line summary that opens smoothly into the message, quotes folded away. */
export function MailMessage({ message, applicationId, connected, initiallyOpen, sameSubject }: { message: ThreadMessage; applicationId: string; connected: boolean; initiallyOpen: boolean; sameSubject: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  const [showQuote, setShowQuote] = useState(false)
  const reduce = useReducedMotion()
  const outgoing = message.direction === "out"
  const sender = outgoing ? "You" : message.fromName || message.fromAddress || "Unknown sender"
  const initials = sender.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()
  const { body, quoted } = splitQuoted(message.text || "")
  const kind = !outgoing && message.kind && Object.hasOwn(KIND_LABEL, message.kind) && message.kind !== "other" ? (message.kind as MailKind) : null
  const unread = !message.readAt && !outgoing

  return (
    <li className={cn("relative transition-colors", open ? "bg-background" : "hover:bg-muted/40")}>
      {unread ? <span className="absolute inset-y-3 start-0 w-0.5 rounded-full bg-brand" aria-hidden /> : null}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 px-5 py-3.5 text-start outline-none focus-visible:bg-muted/50">
        <span aria-hidden className={cn("mt-0.5 grid size-8 shrink-0 place-content-center rounded-full text-[11px] font-semibold", outgoing ? "bg-foreground text-background" : "bg-muted text-foreground")}>
          {outgoing ? <ArrowUpRightIcon className="size-3.5" /> : initials || "?"}
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{sender}</span>
            {kind ? <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-medium ring-1", KIND_TONE[kind] ?? "bg-muted text-muted-foreground ring-border")}>{KIND_LABEL[kind]}</span> : null}
            <time dateTime={message.sentAt.toISOString()} title={message.sentAt.toLocaleString()} className="ms-auto shrink-0 text-xs text-muted-foreground tabular-nums">{when(message.sentAt)}</time>
          </span>
          {!sameSubject || !open ? <span className={cn("truncate text-sm", open ? "text-foreground" : "text-muted-foreground")}>{open ? message.subject || "No subject" : body.replace(/\s+/g, " ").slice(0, 160) || message.subject || "No message text"}</span> : null}
        </span>
        <ChevronDownIcon aria-hidden className={cn("mt-1.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="grid min-w-0 gap-3 px-5 pb-5 ps-16">
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {outgoing ? <>To {message.toAddresses.join(", ")}</> : <>From <span className="text-foreground">{message.fromAddress}</span> · to {message.toAddresses.join(", ")}</>}
              </p>
              <div dir="auto" className="max-w-[68ch] text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{body || "This email has no readable text."}</div>
              {quoted ? (
                <div className="grid gap-2">
                  <button type="button" onClick={() => setShowQuote(!showQuote)} className="inline-flex w-fit items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                    <MessageSquareQuoteIcon className="size-3.5" /> {showQuote ? "Hide quoted text" : "Show quoted text"}
                  </button>
                  {showQuote ? <div dir="auto" className="max-w-[68ch] border-s-2 ps-3 text-xs leading-5 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{quoted}</div> : null}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {!outgoing ? <ComposeEmail applicationId={applicationId} connected={connected} hasReplies replyToId={message.id} /> : null}
                {!outgoing && message.matchReason ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={message.matchReason}>
                    <LinkIcon className="size-3" /> <span className="max-w-[40ch] truncate">Linked because {message.matchReason.charAt(0).toLowerCase() + message.matchReason.slice(1)}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  )
}
