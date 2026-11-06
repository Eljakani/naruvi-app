"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { ArrowUpIcon, BanIcon, CheckIcon, CircleDashedIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react"
import { useStep } from "@/components/ai-progress"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { Message, MessageContent, MessageGroup } from "@/components/ui/message"
import { Trace, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { cn } from "@/lib/utils"

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
export function AgentThread({ turns, working, steps, className }: { turns: AgentTurn[]; working?: string | null; steps: readonly string[]; className?: string }) {
  const end = useRef<HTMLDivElement>(null)
  const step = useStep(Boolean(working), steps.length)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [turns.length, working, step])
  if (!turns.length && !working) return null
  return (
    <MessageGroup className={cn("max-h-80 gap-3 overflow-y-auto pr-1", className)} aria-live="polite">
      {turns.map((turn, index) => {
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
            <Message>
              <MessageContent className="gap-1.5">
                <Trace>
                  <TraceLine status={turn.outcome === "error" ? "error" : undefined} className="items-start">
                    <TraceIcon className="mt-0.5">
                      <outcome.icon className={cn("cb-pop", outcome.className)} />
                    </TraceIcon>
                    {/* Replies wrap; only live step labels stay on one line. */}
                    <TraceTitle className="overflow-visible text-clip whitespace-normal text-foreground">{turn.summary}</TraceTitle>
                  </TraceLine>
                </Trace>
                {turn.detail ? <div className="pl-6 text-xs text-muted-foreground">{turn.detail}</div> : null}
                {index === turns.length - 1 && turn.actions ? <div className="flex flex-wrap gap-1.5 pl-6">{turn.actions}</div> : null}
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
          <Message>
            <MessageContent>
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
      <div ref={end} />
    </MessageGroup>
  )
}

/** The message field: Enter sends, Shift+Enter adds a line; suggestions send in one click. */
export function AgentComposer({ value, onChange, onSend, busy, placeholder, suggestions = [], minLength = 1, label = "Message" }: { value: string; onChange: (value: string) => void; onSend: (text: string) => void; busy?: boolean; placeholder: string; suggestions?: string[]; minLength?: number; label?: string }) {
  const ready = !busy && value.trim().length >= minLength
  return (
    <div className="grid gap-2">
      {suggestions.length && !busy ? (
        <div className="cb-stagger flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <Button key={suggestion} size="xs" variant="outline" className="bg-background font-normal text-muted-foreground" onClick={() => onSend(suggestion)}>
              <SparklesIcon className="size-3" /> {suggestion}
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
            <span className="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
            <InputGroupButton type="submit" size="icon-sm" variant="default" className="rounded-full" disabled={!ready} aria-label="Send">
              {busy ? <LoaderCircleIcon className="animate-spin" /> : <ArrowUpIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  )
}
