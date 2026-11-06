"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { ArrowRightIcon, BriefcaseBusinessIcon, CalendarClockIcon, CheckIcon, LoaderCircleIcon, SparklesIcon, SquarePenIcon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"
import { applyProposalAction, askAssistantAction } from "@/app/(app)/assistant/actions"
import { AgentComposer } from "@/components/agent/agent-chat"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Message, MessageContent } from "@/components/ui/message"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import type { Proposal } from "@/lib/assistant"
import { cn } from "@/lib/utils"

type Turn =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; steps: string[]; proposals: { proposal: Proposal; applied?: boolean }[]; error?: boolean }

const STORAGE = "naruvi-assistant"
const SUGGESTIONS = ["What should I do today?", "Which applications have had no news?", "Which saved jobs fit me best?", "How do I import my LinkedIn profile?"]
const WORKING = ["Reading your question", "Looking through your data", "Writing an answer"]
const id = () => Math.random().toString(36).slice(2)

const OPEN_EVENT = "naruvi:assistant"
/** Opens the assistant from anywhere (sidebar entry, header button, other pages). */
export const openAssistant = () => window.dispatchEvent(new Event(OPEN_EVENT))

/** Sidebar entry. */
export function AssistantSidebarItem() {
  return (
    <SidebarMenuButton tooltip="Ask Naruvi (Ctrl+J)" onClick={openAssistant}>
      <SparklesIcon />
      <span>Ask Naruvi</span>
      <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">Ctrl J</Kbd>
    </SidebarMenuButton>
  )
}

/** Header button, for phones where the sidebar is tucked away. */
export function AssistantHeaderButton() {
  return (
    <Button size="icon-sm" variant="ghost" aria-label="Ask Naruvi" className="md:hidden" onClick={openAssistant}>
      <SparklesIcon />
    </Button>
  )
}

/** The left-side panel, mounted once in the app layout. Ctrl/⌘+J toggles it. */
export function AssistantPanel() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "j" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <Conversation onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}

function Conversation({ onNavigate }: { onNavigate: () => void }) {
  const path = usePathname()
  const [turns, setTurns] = useState<Turn[]>(() => {
    if (typeof window === "undefined") return []
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE) ?? "[]") as Turn[]
    } catch {
      return []
    }
  })
  const [draft, setDraft] = useState("")
  const [working, startWorking] = useTransition()
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionStorage.setItem(STORAGE, JSON.stringify(turns.slice(-30)))
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }, [turns, working])

  const send = (text: string) => {
    const question = text.trim()
    if (!question || working) return
    const next: Turn[] = [...turns, { id: id(), role: "user", content: question }]
    setTurns(next)
    setDraft("")
    startWorking(async () => {
      const result = await askAssistantAction(next.map((turn) => ({ role: turn.role, content: turn.content })), path)
      setTurns((current) => [
        ...current,
        result.ok
          ? { id: id(), role: "assistant", content: result.data.text, steps: result.data.steps, proposals: result.data.proposals.map((proposal) => ({ proposal })) }
          : { id: id(), role: "assistant", content: result.message, steps: [], proposals: [], error: true },
      ])
    })
  }

  const markApplied = (turnId: string, index: number) =>
    setTurns((current) => current.map((turn) => (turn.id === turnId && turn.role === "assistant" ? { ...turn, proposals: turn.proposals.map((item, i) => (i === index ? { ...item, applied: true } : item)) } : turn)))

  return (
    <>
      <SheetHeader className="flex-row items-center gap-2 border-b px-4 py-3">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <SparklesIcon className="size-4" />
        </span>
        <div className="grid flex-1 gap-0">
          <SheetTitle className="text-sm">Ask Naruvi</SheetTitle>
          <SheetDescription className="text-xs">Questions about your search or the app. Changes wait for your click.</SheetDescription>
        </div>
        {turns.length ? (
          <Button size="icon-sm" variant="ghost" aria-label="New conversation" className="mr-8" onClick={() => setTurns([])} disabled={working}>
            <SquarePenIcon />
          </Button>
        ) : null}
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {turns.length ? (
          <div className="grid gap-4">
            {turns.map((turn) =>
              turn.role === "user" ? (
                <Message key={turn.id} align="end" className="cb-step">
                  <MessageContent>
                    <Bubble align="end" variant="muted">
                      <BubbleContent className="whitespace-pre-wrap">{turn.content}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              ) : (
                <Message key={turn.id} className="cb-step">
                  <MessageContent className="grid gap-2">
                    {turn.steps.length ? (
                      <Trace>
                        {turn.steps.map((step) => (
                          <TraceLine key={step} className="text-xs">
                            <TraceIcon><CheckIcon className="size-3.5" /></TraceIcon>
                            <TraceTitle>{step}</TraceTitle>
                          </TraceLine>
                        ))}
                      </Trace>
                    ) : null}
                    <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", turn.error && "text-destructive")}>{turn.content}</p>
                    {turn.proposals.length ? (
                      <div className="cb-stagger grid gap-2">
                        {turn.proposals.map((item, index) => (
                          <ProposalCard key={index} proposal={item.proposal} applied={item.applied} onApplied={() => markApplied(turn.id, index)} onNavigate={onNavigate} />
                        ))}
                      </div>
                    ) : null}
                  </MessageContent>
                </Message>
              ),
            )}
            {working ? <Working /> : null}
            <div ref={end} />
          </div>
        ) : (
          <div className="grid h-full content-center justify-items-center gap-2 text-center">
            <SparklesIcon className="size-6 text-muted-foreground" />
            <p className="font-medium">How can I help?</p>
            <p className="max-w-72 text-sm text-muted-foreground">Ask about your applications, jobs and contacts, or how to do something in Naruvi.</p>
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <AgentComposer value={draft} onChange={setDraft} onSend={send} busy={working} placeholder="Ask anything…" suggestions={turns.length ? [] : SUGGESTIONS} label="Message Naruvi" />
      </div>
    </>
  )
}

function Working() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setStep((value) => Math.min(value + 1, WORKING.length - 1)), 1600)
    return () => clearInterval(timer)
  }, [])
  return (
    <Trace role="status" className="cb-step">
      <TraceLine status="running" className="text-xs">
        <TraceIcon><LoaderCircleIcon className="size-3.5 animate-spin" /></TraceIcon>
        <TraceTitle>{WORKING[step]}…</TraceTitle>
      </TraceLine>
    </Trace>
  )
}

const STAGE: Record<string, string> = { submitted: "Sent", interviewing: "Interviewing", offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn" }

function describe(proposal: Proposal): { icon: typeof SparklesIcon; title: string; lines: string[]; action: string } {
  if (proposal.kind === "application") {
    const lines = [
      proposal.status ? `Stage → ${STAGE[proposal.status]}` : "",
      proposal.nextStep ? `Next step → ${proposal.nextStep}` : "",
      proposal.nextStepDue ? `Due → ${new Date(`${proposal.nextStepDue}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}` : "",
      proposal.archived !== undefined ? (proposal.archived ? "Archive it" : "Restore it") : "",
    ].filter(Boolean)
    return { icon: CalendarClockIcon, title: proposal.label, lines, action: "Apply" }
  }
  if (proposal.kind === "contact") return { icon: UserPlusIcon, title: `Add ${proposal.name}`, lines: [[proposal.title, proposal.companyName].filter(Boolean).join(" · "), proposal.email || proposal.linkedinUrl].filter(Boolean), action: "Add contact" }
  if (proposal.kind === "job") return { icon: BriefcaseBusinessIcon, title: "Save this job", lines: [proposal.url], action: "Save and review" }
  return { icon: ArrowRightIcon, title: proposal.label, lines: [], action: "Open" }
}

function ProposalCard({ proposal, applied, onApplied, onNavigate }: { proposal: Proposal; applied?: boolean; onApplied: () => void; onNavigate: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { icon: Icon, title, lines, action } = describe(proposal)
  const run = () =>
    startTransition(async () => {
      const result = await applyProposalAction(proposal)
      if (!result.ok) return void toast.error("Couldn’t apply that", { description: result.message })
      if (proposal.kind === "open") {
        onNavigate()
        return router.push(result.data.href!)
      }
      onApplied()
      toast.success(result.data.done, result.data.href ? { action: { label: "Open", onClick: () => { onNavigate(); router.push(result.data.href!) } } } : undefined)
      if (proposal.kind === "job" && result.data.href) {
        onNavigate()
        router.push(result.data.href)
      }
    })

  if (proposal.kind === "open") {
    return (
      <Button variant="outline" size="sm" className="w-fit" onClick={run} disabled={pending}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <ArrowRightIcon />} {title}
      </Button>
    )
  }
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border bg-card p-3 text-sm transition-opacity", applied && "opacity-70")}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate font-medium">{title}</span>
        {lines.map((line) => <span key={line} className="truncate text-xs text-muted-foreground">{line}</span>)}
      </div>
      {applied ? (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><CheckIcon className="cb-pop size-3.5 text-primary" /> Done</span>
      ) : (
        <Button size="sm" className="shrink-0" onClick={run} disabled={pending}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : null} {action}
        </Button>
      )}
    </div>
  )
}
