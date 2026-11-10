"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowUpIcon, BanIcon, CheckIcon, CircleDashedIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react"
import { useStep } from "@/components/ai-progress"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { Message, MessageContent, MessageGroup } from "@/components/ui/message"
import { Trace, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { NaruviAvatar, Otter, type OtterPose } from "@/components/naruvi/otter"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

/**
 * Naruvi's agent conversations, built on shadcn AI Elements (Message, Bubble,
 * Trace): what you asked, what the agent did step by step, and what came out.
 */
export type AgentTurn = {
  id: string
  request: string
  outcome: "applied" | "unchanged" | "rejected" | "error"
  summary: string
  detail?: ReactNode
  /** Actions on the latest reply ("Apply to both", "Undo"…). */
  actions?: ReactNode
}

const OUTCOME = {
  applied: { icon: CheckIcon, className: "text-primary" },
  unchanged: { icon: CircleDashedIcon, className: "" },
  rejected: { icon: BanIcon, className: "" },
  error: { icon: BanIcon, className: "text-destructive" },
} as const

/** The conversation so far, plus the turn in progress with its live steps. */
export function AgentThread({ turns, working, steps, className, pose = "working-on-it", intro }: { turns: AgentTurn[]; working?: string | null; steps: readonly string[]; className?: string; /** Naruvi's pose while this agent works. */ pose?: OtterPose; /** Shown before the first request: what this agent does, in Naruvi's words. */ intro?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const step = useStep(Boolean(working), steps.length)
  const [showAll, setShowAll] = useState(false)
  // Scroll only inside the thread: scrollIntoView would also move the page you're editing.
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [turns.length, working, step])
  // Older turns fold away, so the thread stays short and never needs its own scrollbar.
  const hidden = showAll ? 0 : Math.max(0, turns.length - (working ? 1 : 2))
  const visible = turns.slice(hidden)
  if (!turns.length && !working) {
    return intro ? (
      <div className="cb-step flex items-end gap-2.5">
        <Otter pose={pose} height={64} className="-mb-1" />
        <p className="rounded-2xl rounded-bl-sm border bg-background px-3 py-2 text-sm text-pretty text-muted-foreground shadow-xs">{intro}</p>
      </div>
    ) : null
  }
  return (
    <MessageGroup ref={box} className={cn("max-h-[28rem] gap-3 overflow-y-auto overscroll-contain pe-1 wrap-anywhere", className)} aria-live="polite">
      {hidden ? (
        <button type="button" onClick={() => setShowAll(true)} className="mx-auto rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          Show {hidden} earlier {hidden === 1 ? "request" : "requests"}
        </button>
      ) : null}
      {visible.map((turn, i) => {
        const index = i + hidden
        const outcome = OUTCOME[turn.outcome]
        return (
          <div key={turn.id} className="cb-step grid gap-2">
            <Message align="end">
              <MessageContent>
                <Bubble align="end" variant="muted">
                  <BubbleContent>{turn.request}</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
            <Message className="items-start gap-2">
              <NaruviAvatar size={22} className="mt-px" />
              <MessageContent className="min-w-0 gap-1.5">
                <Trace>
                  <TraceLine status={turn.outcome === "error" ? "error" : undefined} className="items-start">
                    <TraceIcon className="mt-0.5">
                      <outcome.icon className={cn("cb-pop", outcome.className)} />
                    </TraceIcon>
                    {/* Replies wrap; only live step labels stay on one line. */}
                    <TraceTitle className="overflow-visible text-clip whitespace-normal text-foreground">{turn.summary}</TraceTitle>
                  </TraceLine>
                </Trace>
                {turn.detail ? <div className="ps-6 text-xs text-muted-foreground">{turn.detail}</div> : null}
                {index === turns.length - 1 && turn.actions ? <div className="flex flex-wrap gap-1.5 ps-6">{turn.actions}</div> : null}
              </MessageContent>
            </Message>
          </div>
        )
      })}
      {working ? (
        <div className="grid gap-2">
          <Message align="end">
            <MessageContent>
              <Bubble align="end" variant="muted">
                <BubbleContent>{working}</BubbleContent>
              </Bubble>
            </MessageContent>
          </Message>
          <Message className="items-end gap-2">
            <Otter pose={pose} height={52} className="-mb-1" />
            <MessageContent className="min-w-0">
              <Trace role="status">
                {steps.slice(0, step + 1).map((label, index) => (
                  <TraceLine key={label} status={index === step ? "running" : undefined} className="cb-step">
                    <TraceIcon>{index === step ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon className="cb-pop" />}</TraceIcon>
                    <TraceTitle>{label}</TraceTitle>
                    {index === step ? <TraceDescription>{index + 1} of {steps.length}</TraceDescription> : null}
                  </TraceLine>
                ))}
              </Trace>
            </MessageContent>
          </Message>
        </div>
      ) : null}
    </MessageGroup>
  )
}

/** The message field: Enter sends, Shift+Enter adds a line; suggestions send in one click. */
export function AgentComposer({ value, onChange, onSend, busy, placeholder, suggestions = [], minLength = 1, label }: { value: string; onChange: (value: string) => void; onSend: (text: string) => void; busy?: boolean; placeholder: string; suggestions?: string[]; minLength?: number; label?: string }) {
  const t = useTranslations("ui")
  label ??= t("message")
  const ready = !busy && value.trim().length >= minLength
  return (
    <div className="grid gap-2">
      {suggestions.length ? (
        // Stays in place while busy (just quieter), so the composer never jumps up and down.
        <div className={cn("flex flex-wrap gap-1.5 transition-opacity duration-200", busy ? "pointer-events-none opacity-40" : "cb-stagger")} aria-hidden={busy || undefined}>
          {suggestions.map((suggestion) => (
            <Button key={suggestion} size="xs" variant="outline" disabled={busy} className="bg-background font-normal text-muted-foreground transition-[background-color,color,translate] hover:-translate-y-px hover:text-foreground active:translate-y-0" onClick={() => onSend(suggestion)}>
              <SparklesIcon className="size-3 text-brand" /> {suggestion}
            </Button>
          ))}
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) onSend(value)
        }}
      >
        <InputGroup className="bg-background">
          <InputGroupTextarea
            aria-label={label}
            value={value}
            maxLength={500}
            disabled={busy}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                if (ready) onSend(value)
              }
            }}
            placeholder={placeholder}
            className="min-h-14 text-base sm:text-sm"
          />
          <InputGroupAddon align="block-end" className="justify-between">
            <span className="text-xs text-muted-foreground">{t("enterToSend")}</span>
            <InputGroupButton type="submit" size="icon-sm" variant="default" className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90" disabled={!ready} aria-label={t("send")}>
              {busy ? <LoaderCircleIcon className="animate-spin" /> : <ArrowUpIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  )
}
