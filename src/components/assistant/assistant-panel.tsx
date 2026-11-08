"use client"

import { ComposeEmail } from "@/components/mail/compose-email"
import { PresenceList } from "@/components/presence"
import Link from "next/link"
import { NaruviAvatar, Otter } from "@/components/naruvi/otter"
import { usePathname, useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { Collapsible } from "@animate-ui/react/primitives/base-ui/collapsible"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls, type FileUIPart, type InferUITools, type UIMessage } from "ai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useSyncExternalStore } from "react"
import { createContext, lazy, memo, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  ArrowRightIcon, ArrowUpIcon, BanIcon, BriefcaseBusinessIcon, CalendarClockIcon, CheckIcon, ChevronDownIcon, CircleAlertIcon, FileTextIcon, GaugeIcon, GlobeIcon,
  CopyIcon, ExternalLinkIcon, LinkIcon, RotateCcwIcon, MailIcon, MailSearchIcon, SendIcon, SquarePenIcon, Trash2Icon, UserPenIcon, UserPlusIcon, UserRoundIcon, XIcon,
  Building2Icon, type LucideIcon,
} from "lucide-react"
import { FitRing } from "@/components/applications/fit-ring"
import AIPrompt from "@/components/kokonutui/ai-prompt"
import AITextLoading from "@/components/kokonutui/ai-text-loading"
import AIToolApproval from "@/components/kokonutui/ai-tool-approval"
import { DotmCircular5 } from "@/components/ui/dotm-circular-5"
import { EntryLogo } from "@/components/profile/entry-logo"
import { AiStatus, AiStatusIcon } from "@/components/ui/ai-status"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Message, MessageContent } from "@/components/ui/message"
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { CHAT_IMAGE_BYTES, CHAT_IMAGE_MAX, CHAT_IMAGE_TYPES, limitChatImages } from "@/lib/assistant-images"
import { cn } from "@/lib/utils"
import type { assistantTools } from "@/server/assistant/tools"
import type { apiApplications } from "@/server/integrations/api-data"

/* ───────────────────────────── entry points ───────────────────────────── */

const OPEN_EVENT = "naruvi:assistant"
/** Opens the assistant from anywhere, optionally with a question to send. */
export const openAssistant = (prompt?: string) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: prompt }))

const PANEL_ID = "naruvi-assistant"
const WIDTH_KEY = "naruvi-assistant-width"
const MIN_WIDTH = 320
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 400
const clampWidth = (width: number, max = MAX_WIDTH) => Math.min(Math.max(width, MIN_WIDTH), max)

const AssistantContext = createContext({
  open: false,
  visited: false,
  queued: null as string | null,
  toggle: () => {},
  close: () => {},
  clearQueue: () => {},
})

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [visited, setVisited] = useState(false)
  const [queued, setQueued] = useState<string | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const show = () => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setVisited(true)
    setOpen(true)
  }
  const close = useCallback(() => {
    setOpen(false)
    requestAnimationFrame(() => {
      const target = returnFocus.current
      if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true })
      else document.getElementById("assistant-toggle")?.focus({ preventScroll: true })
    })
  }, [])
  const toggle = () => open ? close() : show()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "j" && (event.metaKey || event.ctrlKey) && !event.repeat) {
        event.preventDefault()
        toggle()
      }
    }
    const onOpen = (event: Event) => {
      if (!open) show()
      const prompt = (event as CustomEvent<string | undefined>).detail
      if (prompt) setQueued(prompt)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  })

  return <AssistantContext.Provider value={{ open, visited, queued, toggle, close, clearQueue: () => setQueued(null) }}>{children}</AssistantContext.Provider>
}

const subscribeNever = () => () => {}
/** "⌘J" on a Mac, "Ctrl J" elsewhere. */
function useShortcutLabel() {
  return useSyncExternalStore(subscribeNever, () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘J" : "Ctrl J"), () => "Ctrl J")
}

export function AssistantSidebarItem() {
  const { open, toggle } = useContext(AssistantContext)
  const shortcut = useShortcutLabel()
  return (
    <SidebarMenuButton tooltip={`Ask Naruvi (${shortcut})`} aria-controls={PANEL_ID} aria-expanded={open} isActive={open} onClick={toggle}
      className="text-sidebar-foreground/75 hover:bg-sidebar-accent/60 data-active:text-sidebar-foreground">
      <NaruviAvatar size={16} className="-my-0.5" />
      <span>Ask Naruvi</span>
      <Kbd className="ml-auto bg-transparent opacity-60 group-data-[collapsible=icon]:hidden">{shortcut}</Kbd>
    </SidebarMenuButton>
  )
}

export function AssistantHeaderButton() {
  const { open, toggle } = useContext(AssistantContext)
  return (
    <Button
      id="assistant-toggle"
      size="sm"
      variant="ghost"
      aria-label={open ? "Close Naruvi" : "Wake Naruvi up"}
      aria-controls={PANEL_ID}
      aria-expanded={open}
      onClick={toggle}
      data-awake={open || undefined}
      className="naruvi-trigger h-8 gap-2 rounded-full border ps-1 pe-3 text-foreground"
    >
      <span className="relative grid size-6 place-content-center">
        <NaruviAvatar size={24} className="naruvi-trigger-face" />
        <span aria-hidden="true" className="naruvi-sleep pointer-events-none absolute -end-1 -top-1.5 text-[9px] font-bold text-brand"><span className="naruvi-z inline-block">z</span></span>
      </span>
      <span className="hidden text-sm @min-[30rem]/workspace:inline">{open ? "Naruvi is here" : "Ask Naruvi"}</span>
    </Button>
  )
}

export function AssistantPanel() {
  const { visited } = useContext(AssistantContext)
  return visited ? <DockedAssistant /> : <aside id={PANEL_ID} hidden />
}

function DockedAssistant() {
  const { open, queued, close, clearQueue } = useContext(AssistantContext)
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY))
    return stored > 0 && Number.isFinite(stored) ? clampWidth(stored) : DEFAULT_WIDTH
  })
  const panel = useRef<HTMLElement>(null)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  const [resizing, setResizing] = useState(false)
  // Visual state trails `open` by a frame, so the very first open (when this
  // mounts) still animates from closed instead of appearing fully formed.
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(open))
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (open) panel.current?.focus({ preventScroll: true })
  }, [open])

  // Publish the docked width so floating UI (e.g. "Tell me about it") can sit beside the dock, not under it.
  // Below lg the dock covers the whole screen instead, so nothing needs to move.
  useEffect(() => {
    const root = document.documentElement
    const sync = () => root.style.setProperty("--assistant-dock", shown && window.matchMedia("(min-width: 64rem)").matches ? `${Math.min(width, Math.floor(window.innerWidth * 0.42))}px` : "0px")
    sync()
    window.addEventListener("resize", sync)
    return () => { window.removeEventListener("resize", sync); root.style.setProperty("--assistant-dock", "0px") }
  }, [shown, width])

  const resize = (value: number) => {
    const max = Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.42))
    const next = clampWidth(value, max)
    setWidth(next)
    localStorage.setItem(WIDTH_KEY, String(next))
  }

  // The dock opens by growing from zero width, so the page eases aside instead
  // of jumping; the panel inside keeps its width and glides in. Closed, it is
  // inert: out of the tab order and hidden from screen readers.
  return (
    <div
      inert={!open}
      className={cn(
        "sticky top-0 h-dvh shrink-0 self-start overflow-hidden max-lg:w-full lg:w-[var(--dock-width)]",
        !resizing && "lg:transition-[width] lg:duration-300 lg:ease-[var(--ease-drawer)] motion-reduce:transition-none",
        !open && "max-lg:hidden",
      )}
      style={{ "--dock-width": shown ? `min(${width}px, 42vw)` : "0px", "--assistant-width": `${width}px` } as CSSProperties}
    >
    <aside
      id={PANEL_ID}
      ref={panel}
      tabIndex={-1}
      aria-labelledby="assistant-title"
      data-assistant-open={open ? "" : undefined}
      className={cn(
        "flex h-dvh w-full min-w-0 flex-col bg-background outline-none lg:w-[min(var(--assistant-width),42vw)] lg:border-s",
        "transition-[opacity,translate] duration-300 ease-[var(--ease-drawer)] motion-reduce:translate-x-0 motion-reduce:transition-opacity",
        shown ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0",
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented && event.target instanceof Node && event.currentTarget.contains(event.target)) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <div
        role="separator"
        aria-label="Resize assistant panel"
        aria-controls={PANEL_ID}
        aria-orientation="vertical"
        tabIndex={0}
        className="group/resize absolute inset-y-0 -start-1.5 z-10 hidden w-3 cursor-col-resize touch-none select-none outline-none lg:block"
        onPointerDown={(event) => {
          if (event.button !== 0 || !panel.current) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { startX: event.clientX, startWidth: panel.current.offsetWidth }
          setResizing(true)
        }}
        onPointerMove={(event) => {
          if (drag.current) resize(drag.current.startWidth + drag.current.startX - event.clientX)
        }}
        onLostPointerCapture={() => { drag.current = null; setResizing(false) }}
        onKeyDown={(event) => {
          const current = panel.current?.offsetWidth ?? width
          const step = event.shiftKey ? 64 : 16
          const target = { ArrowLeft: current + step, ArrowRight: current - step, Home: MIN_WIDTH, End: MAX_WIDTH }[event.key]
          if (target !== undefined) {
            event.preventDefault()
            resize(target)
          }
        }}
      >
        <span className="absolute inset-y-0 start-1/2 w-0.5 bg-transparent group-hover/resize:bg-ring group-focus-visible/resize:bg-ring group-active/resize:bg-ring" />
      </div>
      <Conversation queued={queued} onQueuedSent={clearQueue} onClose={close} />
    </aside>
    </div>
  )
}

/* ───────────────────────────── conversation ───────────────────────────── */

const STORAGE = "naruvi-assistant-v2"
type Suggestion = { icon: LucideIcon; text: string }
const GENERAL: Suggestion[] = [
  { icon: CalendarClockIcon, text: "What should I do today?" },
  { icon: GaugeIcon, text: "Which saved jobs fit me best?" },
  { icon: SendIcon, text: "Start a spontaneous application" },
  { icon: UserPlusIcon, text: "Add a recruiter to my contacts" },
]

/** What Naruvi is looking at, and what's most useful to ask there. */
function pageContext(path: string): { label: string; suggestions: Suggestion[] } {
  if (/^\/applications\/[^/]+\/letter/.test(path)) return { label: "this cover letter", suggestions: [{ icon: MailIcon, text: "Make this letter shorter and more direct" }, { icon: GlobeIcon, text: "Add something specific about the company" }, { icon: UserRoundIcon, text: "Who should I send it to?" }] }
  if (/^\/applications\/[^/]+\/cv/.test(path)) return { label: "this CV", suggestions: [{ icon: FileTextIcon, text: "What's missing from this CV for the job?" }, { icon: GaugeIcon, text: "Which requirements am I weakest on?" }, { icon: MailIcon, text: "Draft the cover letter too" }] }
  if (/^\/applications\/[^/]+/.test(path)) return { label: "this application", suggestions: [{ icon: GaugeIcon, text: "Summarize where this application stands" }, { icon: MailIcon, text: "Draft the cover letter" }, { icon: CalendarClockIcon, text: "Set a follow-up for next week" }, { icon: UserRoundIcon, text: "Who should I contact here?" }] }
  if (/^\/jobs\/[^/]+/.test(path) && !path.startsWith("/jobs/new")) return { label: "this job", suggestions: [{ icon: GaugeIcon, text: "Is this job a good fit for me?" }, { icon: BriefcaseBusinessIcon, text: "Start an application for this job" }, { icon: GlobeIcon, text: "Research this company" }] }
  if (path.startsWith("/jobs")) return { label: "your jobs", suggestions: [{ icon: GaugeIcon, text: "Which saved jobs fit me best?" }, { icon: BriefcaseBusinessIcon, text: "Add a job from a link" }, { icon: CalendarClockIcon, text: "Which jobs haven't I applied to yet?" }] }
  if (path.startsWith("/contacts")) return { label: "your contacts", suggestions: [{ icon: UserPlusIcon, text: "Add a recruiter to my contacts" }, { icon: MailSearchIcon, text: "Which contacts have no email yet?" }, { icon: SendIcon, text: "Start a spontaneous application" }] }
  if (path.startsWith("/companies")) return { label: "your companies", suggestions: [{ icon: GlobeIcon, text: "Which companies have I applied to most?" }, { icon: SendIcon, text: "Start a spontaneous application" }] }
  if (path.startsWith("/profile")) return { label: "your profile", suggestions: [{ icon: UserRoundIcon, text: "What's missing from my profile?" }, { icon: FileTextIcon, text: "Which entries have no facts yet?" }, { icon: GaugeIcon, text: "What are my strongest skills?" }] }
  if (path === "/applications") return { label: "your applications", suggestions: [{ icon: CalendarClockIcon, text: "Which applications have had no news?" }, { icon: GaugeIcon, text: "Which application should I push next?" }, { icon: SendIcon, text: "Start a spontaneous application" }] }
  return { label: "your dashboard", suggestions: GENERAL }
}


type Part = UIMessage["parts"][number]
type ToolPart = Extract<Part, { toolCallId: string }> & { type: string; state: string; input?: Record<string, unknown>; output?: Record<string, unknown>; errorText?: string; approval?: { id: string; approved?: boolean } }
const isTool = (part: Part): part is ToolPart => part.type.startsWith("tool-")
const toolName = (part: ToolPart) => part.type.slice(5)

function loadMessages(): UIMessage[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE) ?? "[]") as UIMessage[]
  } catch {
    return []
  }
}

function Conversation({ queued, onQueuedSent, onClose }: { queued: string | null; onQueuedSent: () => void; onClose: () => void }) {
  const router = useRouter()
  const [initial] = useState(loadMessages)
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/assistant",
    prepareSendMessagesRequest: ({ messages }) => ({ body: { messages: limitChatImages(messages.slice(-40)), path: window.location.pathname } }),
  }), [])
  const { messages, sendMessage, regenerate, status, stop, error, clearError, setMessages, addToolOutput, addToolApprovalResponse } = useChat({
    messages: initial,
    transport,
    throttle: 32,
    sendAutomaticallyWhen: (options) => lastAssistantMessageIsCompleteWithApprovalResponses(options) || lastAssistantMessageIsCompleteWithToolCalls(options),
  })
  const busy = status === "submitted" || status === "streaming"
  // One clock per turn, started by what started the turn, so the elapsed time never jumps back to 0 between steps.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [images, setImages] = useState<FileUIPart[]>([])
  const [imageError, setImageError] = useState("")
  const [readingImage, setReadingImage] = useState(false)
  // A follow-up typed while Naruvi works waits here and goes out when the reply ends.
  const [followUp, setFollowUp] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "ready" && status !== "error") return
    try {
      sessionStorage.setItem(STORAGE, JSON.stringify(limitChatImages(messages.slice(-40))))
    } catch {
      // The open conversation still works when browser storage is full.
    }
  }, [messages, status])

  // Something changed in Naruvi: refresh what's on screen behind the panel.
  const finished = messages.flatMap((message) => message.parts.filter((part) => isTool(part) && ACTIONS[toolName(part)] && part.state === "output-available").map((part) => (part as ToolPart).toolCallId)).join()
  const seen = useRef(finished)
  useEffect(() => {
    if (finished !== seen.current) {
      seen.current = finished
      router.refresh()
    }
  }, [finished, router])

  const send = (text: string, attachments: FileUIPart[] = []) => {
    setTurnStartedAt(Date.now())
    const value = text.trim()
    if ((!value && !attachments.length) || busy) return
    clearError()
    // The page travels with the message, so the history shows where each question was asked.
    const metadata = { path: window.location.pathname }
    void sendMessage(attachments.length ? { parts: [...(value ? [{ type: "text" as const, text: value }] : []), ...attachments], metadata } : { text: value, metadata })
  }
  const sendDraft = () => {
    if (busy && draft.trim() && !images.length) {
      setFollowUp(draft.trim())
      setDraft("")
      return
    }
    if (busy || readingImage || (!draft.trim() && !images.length)) return
    send(draft, images)
    setDraft("")
    setImages([])
    setImageError("")
  }
  const readImage = (file: File) => new Promise<FileUIPart>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ type: "file", mediaType: file.type, filename: file.name, url: String(reader.result) })
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  /** Adds what fits (up to the limit), skips what doesn't, and says why. */
  const attachImages = (files: File[]) => {
    if (busy || readingImage || !files.length) return
    const valid = files.filter((file) => CHAT_IMAGE_TYPES.some((type) => type === file.type) && file.size > 0 && file.size <= CHAT_IMAGE_BYTES)
    const room = CHAT_IMAGE_MAX - images.length
    const accepted = valid.slice(0, Math.max(0, room))
    const problems = [
      valid.length < files.length ? "Only PNG, JPEG or WebP images up to 2 MB" : "",
      valid.length > accepted.length ? `Up to ${CHAT_IMAGE_MAX} images per message` : "",
    ].filter(Boolean)
    setImageError(problems.join(". "))
    if (!accepted.length) return
    setReadingImage(true)
    Promise.all(accepted.map(readImage))
      .then((parts) => setImages((current) => [...current, ...parts].slice(0, CHAT_IMAGE_MAX)))
      .catch(() => setImageError("Couldn’t read an image. Try attaching it again."))
      .finally(() => setReadingImage(false))
  }
  useEffect(() => {
    // Waiting on an approval or a question: hold the follow-up until that is answered.
    if (!followUp || busy || error) return
    const waiting = messages.at(-1)?.parts.some((part) => isTool(part) && (part.state === "approval-requested" || (toolName(part) === "ask_user" && part.state === "input-available")))
    if (waiting) return
    const timer = window.setTimeout(() => { send(followUp); setFollowUp(null) }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send once when the turn settles
  }, [followUp, busy, error, messages])
  useEffect(() => {
    if (!queued || busy) return
    const timer = window.setTimeout(() => {
      send(queued)
      onQueuedSent()
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- schedule once per queued prompt when idle
  }, [queued, busy])

  const onNavigate = useCallback(() => {
    if (!window.matchMedia("(min-width: 64rem)").matches) onClose()
  }, [onClose])
  const onAnswer = useCallback((toolCallId: string, choice: string) => {
    setTurnStartedAt(Date.now())
    void addToolOutput({ tool: "ask_user", toolCallId, output: { choice } } as never)
  }, [addToolOutput])
  const onApproval = useCallback((id: string, approved: boolean) => {
    setTurnStartedAt(Date.now())
    void addToolApprovalResponse({ id, approved })
  }, [addToolApprovalResponse])

  const last = messages.at(-1)
  const latestStep = last?.role === "assistant"
    ? last.parts.slice(last.parts.findLastIndex((part) => part.type === "step-start") + 1)
    : []
  const toolOwnsStatus = latestStep.some((part) => isTool(part) && (
    READS[toolName(part)] || ACTIONS[toolName(part)] || toolName(part) === "ask_user"
  ) && (
    part.state === "input-streaming" || part.state === "input-available" ||
    part.state === "approval-requested" ||
    (part.state === "approval-responded" && part.approval?.approved)
  ))
  const working = busy && !toolOwnsStatus
  // Safe here: the panel only renders after the user opens it, never while prerendering.
  const context = pageContext(usePathname())
  const writing = status === "streaming" && latestStep.some((part) => part.type === "text" && part.state === "streaming" && part.text.trim())
  const mood = !busy ? null : writing ? "Writing" : toolOwnsStatus ? "Working on it" : "Thinking"
  const retry = () => { setTurnStartedAt(Date.now()); clearError(); void regenerate() }


  return (
    <>
      <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b px-4 py-2">
        <NaruviAvatar size={32} />
        <div className="min-w-0 flex-1">
          <h2 id="assistant-title" className="text-sm font-semibold">Naruvi</h2>
          <p key={mood ?? context.label} aria-live="polite" className={cn("cb-fade truncate text-xs", mood ? "font-medium text-brand" : "text-muted-foreground")}>
            {mood ? `${mood}…` : `Looking at ${context.label}`}
          </p>
        </div>
        {messages.length ? (
          <Button size="icon-sm" variant="ghost" aria-label="New conversation" title="New conversation" disabled={busy} onClick={() => { setMessages([]); sessionStorage.removeItem(STORAGE) }}>
            <SquarePenIcon />
          </Button>
        ) : null}
        <Button size="icon-sm" variant="ghost" aria-label="Close assistant" title="Close assistant" onClick={onClose}>
          <XIcon />
        </Button>
      </header>

      {/* Open at the latest message; when you send, your question anchors at the top while the reply streams below. */}
      <MessageScrollerProvider defaultScrollPosition="end">
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label="Conversation" tabIndex={0} className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <MessageScrollerContent className="gap-5 px-4 py-5">
              {messages.length ? (
                messages.map((message) => (
                  <TranscriptMessage key={message.id} message={message} onNavigate={onNavigate} onAnswer={onAnswer} onApproval={onApproval} busy={busy && message.id === last?.id} stale={message.id !== last?.id} onRetry={!busy && message.id === last?.id ? retry : undefined} />
                ))
              ) : (
                <Welcome onPick={send} suggestions={context.suggestions} label={context.label} />
              )}
              {/* While text streams, the text itself is the progress; the indicator fades out instead of vanishing. */}
              <AnimatePresence initial={false}>
                {working && !writing ? (
                  <MessageScrollerItem key="thinking">
                    <ThinkingIndicator startedAt={turnStartedAt} />
                  </MessageScrollerItem>
                ) : null}
              </AnimatePresence>
              {error ? (
                <MessageScrollerItem>
                  <div role="alert" className="cb-step flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm">
                    <Otter pose="careful" height={44} className="-my-1 shrink-0" />
                    <div className="grid min-w-0 flex-1 gap-2">
                      <p className="text-pretty">{friendlyError(error.message)}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="xs" onClick={retry}><RotateCcwIcon /> Try again</Button>
                        {/model|settings|api key/i.test(error.message) ? <Button size="xs" variant="outline" nativeButton={false} render={<Link href="/integrations#ai" onClick={onNavigate} />}>Open AI settings</Button> : null}
                      </div>
                    </div>
                  </div>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <AIPrompt
        value={draft}
        onChange={setDraft}
        onSubmit={sendDraft}
        onStop={() => void stop()}
        onAttach={attachImages}
        attachmentCount={images.length}
        attachmentLimit={CHAT_IMAGE_MAX}
        accept={CHAT_IMAGE_TYPES.join(",")}
        placeholder={busy ? (followUp ? "Naruvi will read your follow-up next…" : "Add a follow-up, it goes out when Naruvi finishes…") : messages.length ? "Reply, or ask something else…" : "Ask anything, or tell Naruvi what to do…"}
        responding={busy}
        queued={followUp ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="mb-2 flex items-center gap-2 rounded-xl border bg-muted/40 py-1.5 ps-3 pe-1 text-xs">
            <span className="shrink-0 font-medium text-brand">Up next</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{followUp}</span>
            <button type="button" aria-label="Edit follow-up" title="Edit" onClick={() => { setDraft(followUp); setFollowUp(null) }} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><SquarePenIcon className="size-3.5" /></button>
            <button type="button" aria-label="Cancel follow-up" title="Cancel" onClick={() => setFollowUp(null)} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><XIcon className="size-3.5" /></button>
          </motion.div>
        ) : null}
        readingAttachment={readingImage}
        canSend={busy ? Boolean(draft.trim()) : !readingImage && Boolean(draft.trim() || images.length)}
        attachmentError={imageError}
        attachment={images.length ? (
          <ul className="flex flex-wrap gap-2" aria-label="Attached images">
            <PresenceList>
              {images.map((part, index) => (
                <motion.li key={part.url.slice(-48) + index} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }} className="group/thumb relative">
                  <ChatImage part={part} className="size-14 rounded-lg border object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${part.filename || `image ${index + 1}`}`}
                    title="Remove"
                    onClick={() => { setImages((current) => current.filter((_, i) => i !== index)); setImageError("") }}
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <XIcon className="size-3" />
                  </button>
                </motion.li>
              ))}
            </PresenceList>
          </ul>
        ) : null}
      />
    </>
  )
}

function ChatImage({ part, className }: { part: FileUIPart; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- local attachment preview uses an inline data URL
  return <img src={part.url} alt={part.filename || "Attached image"} className={className} />
}

function friendlyError(message: string) {
  if (/image|vision|multimodal/i.test(message)) {
    return "The AI model couldn’t process this image. Check that your model in Integrations supports images."
  }
  if (/model|settings|api key/i.test(message)) return message
  return "Something went wrong. Try again, or check your AI model in Integrations."
}

const greeting = () => {
  const hour = new Date().getHours()
  return hour < 5 ? "Up late?" : hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening."
}

function Welcome({ onPick, suggestions, label }: { onPick: (text: string) => void; suggestions: Suggestion[]; label: string }) {
  const [hello] = useState(greeting)
  // Sits just above the composer, where the eye already is, instead of floating mid-panel.
  return (
    <div className="flex flex-1 flex-col justify-end gap-4 pb-1">
      <div className="cb-step flex items-end gap-1">
        <div className="relative -mb-1 shrink-0">
          <span className="absolute inset-x-3 bottom-0 h-5 rounded-[50%] bg-brand/15 blur-md" aria-hidden />
          <Otter pose="concept" height={132} className="relative" priority />
        </div>
        <div className="relative mb-6 grid gap-1 rounded-2xl rounded-bl-sm border bg-background px-3.5 py-3 shadow-xs">
          <p className="text-base font-semibold tracking-tight">{hello} I’m Naruvi.</p>
          <p className="text-sm text-pretty text-muted-foreground">I know your jobs, applications, contacts and profile. Tell me what you need and I’ll get it ready. Nothing changes until you say so.</p>
        </div>
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">Ideas for {label}</p>
        <ul key={suggestions[0]?.text} className="cb-stagger grid divide-y overflow-hidden rounded-xl border bg-background">
          {suggestions.map(({ icon: Icon, text }) => (
            <li key={text}>
              <button type="button" onClick={() => onPick(text)} className="group/suggestion flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/suggestion:text-foreground" />
                <span className="flex-1">{text}</span>
                <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-[opacity,translate] duration-150 group-hover/suggestion:translate-x-0.5 group-hover/suggestion:opacity-100 group-focus-visible/suggestion:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ───────────────────────────── assistant turn ───────────────────────────── */

const READS: Record<string, [running: string, done: string]> = {
  what_needs_attention: ["Checking what needs attention", "Checked what needs attention"],
  list_applications: ["Looking through your applications", "Looked through your applications"],
  get_application: ["Opening an application", "Opened an application"],
  search_jobs: ["Searching your saved jobs", "Searched your saved jobs"],
  get_job: ["Reading a job posting", "Read a job posting"],
  list_companies: ["Looking through companies", "Looked through companies"],
  get_company: ["Opening a company", "Opened a company"],
  read_careers_page: ["Checking the careers link", "Checked the careers link"],
  list_contacts: ["Looking through your contacts", "Looked through your contacts"],
  profile_overview: ["Reading your profile", "Read your profile"],
  read_profile_details: ["Checking profile details", "Checked profile details"],
  find_profile_entries: ["Finding the profile entry", "Checked matching profile entries"],
}

// The SDK keeps completed message objects stable while replacing the streaming one.
const TranscriptMessage = memo(function TranscriptMessage(props: Parameters<typeof AssistantMessage>[0]) {
  const { message } = props
  return (
    // Real heights, not estimates (content-visibility), so scroll positions never jump.
    <MessageScrollerItem scrollAnchor={message.role === "user"} className="[content-visibility:visible]">
      {message.role === "user" ? (
        <Message align="end" className="cb-step">
          <MessageContent>
            <Bubble align="end" variant="muted">
              <BubbleContent className="grid gap-2 whitespace-pre-wrap wrap-anywhere">
                {message.parts.map((part, index) => part.type === "text" ? (
                  <span key={index}>{part.text}</span>
                ) : part.type === "file" ? (
                  <ChatImage key={index} part={part} className="max-h-64 max-w-full rounded-md object-contain" />
                ) : null)}
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : <AssistantMessage {...props} />}
    </MessageScrollerItem>
  )
})

function AssistantMessage({ message, onNavigate, onAnswer, onApproval, busy, stale = false, onRetry }: { message: UIMessage; onNavigate: () => void; onAnswer: (toolCallId: string, choice: string) => void; onApproval: (id: string, approved: boolean) => void; busy: boolean; stale?: boolean; onRetry?: () => void }) {
  // Consecutive look-ups collapse into one trace; everything else renders in order.
  const blocks: ReactNode[] = []
  // The card owns the outcome for this turn, including after an approval changes state.
  const hasAction = message.parts.some((part) => isTool(part) && Object.hasOwn(ACTIONS, toolName(part)))
  let reads: ToolPart[] = []
  const flush = () => {
    if (reads.length) blocks.push(<ReadTrace key={`reads-${blocks.length}`} parts={reads} busy={busy} />)
    reads = []
  }
  message.parts.forEach((part, index) => {
    if (isTool(part) && READS[toolName(part)]) return void reads.push(part)
    flush()
    if (!hasAction && part.type === "text" && part.text.trim()) blocks.push(<Markdown key={index} text={part.text} onNavigate={onNavigate} streaming={busy && part.state === "streaming"} />)
    else if (isTool(part) && toolName(part) === "ask_user" && (busy || part.state !== "input-streaming")) blocks.push(<AskCard key={index} part={part} onAnswer={onAnswer} disabled={busy && part.state !== "input-available"} />)
    else if (isTool(part) && toolName(part) === "show_applications" && part.state === "output-available") {
      const applications = part.output?.applications as Awaited<ReturnType<typeof apiApplications>>["applications"] | undefined
      if (applications?.length) blocks.push(<ApplicationResults key={index} applications={applications} onNavigate={onNavigate} />)
    } else if (isTool(part) && toolName(part) === "show_profile" && part.state === "output-available") {
      const profile = part.output?.profile as ProfileResult | null | undefined
      if (profile) blocks.push(<ProfileCard key={index} profile={profile} onNavigate={onNavigate} />)
    }
    else if (isTool(part) && toolName(part) === "draft_email") {
      if (part.state === "output-available" && part.output) {
        const draft = part.output as InferUITools<typeof assistantTools>["draft_email"]["output"]
        blocks.push(<div key={index} className="grid min-w-0 gap-3 rounded-lg border bg-card p-3 text-sm">
          <div className="grid gap-1"><p className="flex items-center gap-2 font-medium"><MailIcon className="size-4" /> Email draft · {draft.company}</p><p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">To {draft.to || "Choose a recipient in the composer"}</p></div>
          <p className="font-medium [overflow-wrap:anywhere]">{draft.subject}</p>
          <p dir="auto" className="max-h-64 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{draft.body}</p>
          {draft.missingDetails.length ? <p className="text-xs text-muted-foreground">To complete: {draft.missingDetails.join(" · ")}</p> : null}
          <div className="flex items-center justify-between gap-2 border-t pt-2"><span className="text-xs text-muted-foreground">Draft only · not sent</span><ComposeEmail applicationId={draft.applicationId} connected={draft.canSend} hasReplies={Boolean(draft.replyTo)} initialDraft={draft} /></div>
        </div>)
      } else if (part.state === "output-error") blocks.push(<p key={index} role="alert" className="text-sm text-destructive">{part.errorText || "Couldn’t write the email draft."}</p>)
      else if (busy) blocks.push(<PendingActivity key={index} label="Drafting an email from the conversation" />)
    }
    else if (isTool(part) && toolName(part) === "open_page" && part.state === "output-available") blocks.push(<OpenButton key={index} path={String(part.input?.path ?? "/")} label={String(part.input?.label ?? "Open")} onNavigate={onNavigate} />)
    else if (isTool(part) && ACTIONS[toolName(part)]) blocks.push(<ActionCard key={index} part={part} busy={busy} stale={stale} onApproval={onApproval} onNavigate={onNavigate} />)
  })
  flush()
  const text = hasAction ? "" : message.parts.flatMap((part) => part.type === "text" ? [part.text.trim()] : []).filter(Boolean).join("\n\n")
  if (!blocks.length) return null
  return (
    <Message className="group/reply cb-step items-start gap-2.5">
      <NaruviAvatar size={26} className="mt-0.5" />
      <MessageContent className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5 wrap-anywhere">
        {blocks}
        {!busy && (text || onRetry) ? <ReplyActions text={text} onRetry={onRetry} /> : null}
      </MessageContent>
    </Message>
  )
}

function ReplyActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false)
  const button = "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
  return (
    <div className="naruvi-reply-actions -ms-2 -mt-1 flex items-center gap-0.5">
      {text ? (
        <button type="button" className={button} onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
        }}>
          {copied ? <CheckIcon className="cb-pop size-3.5 text-brand" /> : <CopyIcon className="size-3.5" />}{copied ? "Copied" : "Copy"}
        </button>
      ) : null}
      {onRetry ? <button type="button" className={button} onClick={onRetry}><RotateCcwIcon className="size-3.5" />Ask again</button> : null}
    </div>
  )
}

type ApplicationResult = Awaited<ReturnType<typeof apiApplications>>["applications"][number]
type ProfileResult = NonNullable<InferUITools<typeof assistantTools>["show_profile"]["output"]["profile"]>

function ProfileCard({ profile, onNavigate }: { profile: ProfileResult; onNavigate: () => void }) {
  return (
    <Link
      href="/profile"
      onClick={onNavigate}
      className="group/result grid gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex items-start gap-3">
        <Avatar size="lg">
          {profile.photoPath ? <AvatarImage src={`/api/assets/${profile.photoPath}`} alt="" /> : null}
          <AvatarFallback><UserRoundIcon aria-hidden className="size-4" /></AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="font-medium">{profile.name}</span>
          {profile.headline ? <span className="text-sm text-muted-foreground">{profile.headline}</span> : null}
          {profile.location ? <span className="text-xs text-muted-foreground">{profile.location}</span> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-2 text-xs">
        <span className="text-muted-foreground">{profile.verified} of {profile.entries} {profile.entries === 1 ? "entry" : "entries"} verified</span>
        <span className="inline-flex items-center gap-1 font-medium group-hover/result:underline">
          Open profile <ArrowRightIcon aria-hidden className="size-3.5" />
        </span>
      </div>
    </Link>
  )
}

function ApplicationResults({ applications, onNavigate }: { applications: ApplicationResult[]; onNavigate: () => void }) {
  return (
    <ul aria-label="Applications" className="grid gap-2">
      {applications.map((application) => (
        <li key={application.id} className="min-w-0">
          <Link
            href={`/applications/${application.id}`}
            onClick={onNavigate}
            className="group/result flex items-start gap-2.5 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <EntryLogo path={application.logoPath} name={application.company ?? application.title} size={32} />
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="text-sm leading-snug font-medium group-hover/result:underline">{application.title}</span>
              {application.company || application.location ? (
                <span className="text-xs text-muted-foreground">{[application.company, application.location].filter(Boolean).join(" · ")}</span>
              ) : null}
              <Badge variant={application.status === "ready" && !application.archived ? "default" : "secondary"} className="mt-1">
                {application.archived ? "Archived" : application.stage}
              </Badge>
            </div>
            {application.fit != null ? <FitRing score={application.fit} /> : null}
            <ArrowRightIcon aria-hidden className="mt-2 size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ReadTrace({ parts, busy }: { parts: ToolPart[]; busy: boolean }) {
  const reducedMotion = useReducedMotion()
  const steps = parts.map((part) => {
    const [running, done] = READS[toolName(part)]
    const pending = part.state === "input-streaming" || part.state === "input-available"
    const failed = part.state === "output-error" || Boolean(part.output?.error) || (toolName(part) === "read_careers_page" && part.output?.page === null)
    return { part, pending, failed, label: failed ? "Lookup failed" : pending ? running : done }
  }).filter((step) => busy || !step.pending)
  if (!steps.length) return null
  const active = steps.find((step) => step.pending)
  const failed = steps.filter((step) => step.failed).length
  const settled = steps.filter((step) => !step.pending).length
  const rows = (
    <div className="grid min-w-0 gap-2">
      {steps.map(({ part, pending, failed, label }) => {
        const source = !pending && !failed && toolName(part) === "read_careers_page"
          ? (part.output?.page as { url?: string; title?: string } | null | undefined)
          : null
        return (
          <div key={part.toolCallId} className="grid min-w-0 gap-1.5">
            {pending ? (
              <AiStatus state="researching" label={label} timer={false} className="text-xs" />
            ) : (
              <TraceLine status={failed ? "error" : undefined} className="text-xs">
                <TraceIcon>{failed ? <CircleAlertIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}</TraceIcon>
                <TraceTitle>{label}</TraceTitle>
                {!failed ? <TraceDescription>{countOf(part.output)}</TraceDescription> : null}
              </TraceLine>
            )}
            {source ? <CareersSource source={source} /> : null}
          </div>
        )
      })}
    </div>
  )
  if (steps.length === 1) return rows

  return (
    <Collapsible.Root className="min-w-0 rounded-lg border bg-muted/25">
      <Collapsible.Trigger className="group/activity flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        {active ? <span aria-hidden><AiStatusIcon state="researching" /></span> : failed ? <CircleAlertIcon className="size-3.5 shrink-0 text-destructive" /> : <CheckIcon className="size-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 font-medium">{active ? active.label : failed ? `Lookups · ${failed} failed` : `${steps.length} lookups completed`}</span>
        {active ? <span className="shrink-0 tabular-nums">{settled} of {steps.length}</span> : null}
        <ChevronDownIcon className="size-3.5 shrink-0 group-data-[panel-open]/activity:rotate-180 motion-safe:transition-transform motion-safe:duration-150" />
      </Collapsible.Trigger>
      <Collapsible.Panel transition={{ duration: reducedMotion ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}>
        <div className="border-t px-2.5 py-2">{rows}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function CareersSource({ source }: { source: { url?: string; title?: string } }) {
  if (!source.url || !URL.canParse(source.url)) return null
  const url = new URL(source.url)
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null
  return (
    <a href={url.href} target="_blank" rel="noreferrer" title={source.title || url.hostname} className="ms-6 inline-flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <GlobeIcon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{source.title || url.hostname}</span>
      <ExternalLinkIcon aria-hidden className="size-3 shrink-0" />
    </a>
  )
}

function countOf(output: Record<string, unknown> | undefined) {
  if (!output) return null
  for (const key of ["applications", "jobs", "contacts", "companies", "entries", "attention"]) {
    const value = output[key]
    if (Array.isArray(value)) return `${value.length} ${key === "attention" ? "items" : key}`
  }
  return null
}

const Streamdown = lazy(() => import("streamdown").then(({ Streamdown }) => ({ default: Streamdown })))

/** Streamed replies use the same renderer as AI Elements' MessageResponse. */
function Markdown({ text, onNavigate, streaming }: { text: string; onNavigate: () => void; streaming: boolean }) {
  const reduced = !!useReducedMotion()
  const components = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      const className = "font-medium underline underline-offset-2"
      if (!href) return <span>{children}</span>
      if (href.startsWith("/")) return <Link href={href} onClick={onNavigate} className={className}>{children}</Link>
      return <a href={href} target="_blank" rel="noreferrer" className={className}>{children}</a>
    },
  }), [onNavigate])

  return (
    <Suspense fallback={<p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{text}</p>}>
      <Streamdown
        className="naruvi-reply min-w-0 space-y-2 text-sm leading-relaxed wrap-anywhere [&_[data-streamdown=heading-1]]:text-base [&_[data-streamdown=heading-2]]:text-sm [&_[data-streamdown=heading-3]]:text-sm"
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
        animated={reduced ? false : { animation: "blurIn", duration: 260, sep: "word", stagger: 18 }}
        caret={streaming && !reduced ? "circle" : undefined}
        skipHtml
        disallowedElements={["img"]}
        urlTransform={(url) => /^(?:https?:\/\/|\/(?![\/\\]))/i.test(url) ? url : ""}
        components={components}
      >
        {text}
      </Streamdown>
    </Suspense>
  )
}

function OpenButton({ path, label, onNavigate }: { path: string; label: string; onNavigate: () => void }) {
  return (
    <Button variant="outline" size="sm" className="cb-step h-auto min-h-8 w-fit max-w-full py-1.5 text-left whitespace-normal wrap-anywhere" nativeButton={false} render={<Link href={path} onClick={onNavigate} />}>
      {label} <ArrowRightIcon />
    </Button>
  )
}

/* ───────────────────────────── ask the user ───────────────────────────── */

function AskCard({ part, onAnswer, disabled }: { part: ToolPart; onAnswer: (toolCallId: string, choice: string) => void; disabled: boolean }) {
  const [other, setOther] = useState("")
  const question = String(part.input?.question ?? "")
  const options = (part.input?.options as string[] | undefined) ?? []
  const answered = part.state === "output-available" ? String(part.output?.choice ?? "") : null
  if (part.state === "input-streaming") return <PendingActivity label="Preparing a question" />
  return (
    <div className="cb-step grid gap-2.5 rounded-xl border bg-card p-3">
      <p className="flex items-start gap-2 text-sm font-medium">
        <span className="min-w-0">{question}</span>
      </p>
      {answered !== null ? (
        <p className="flex items-start gap-1.5 pl-6 text-sm text-muted-foreground"><CheckIcon className="cb-pop mt-0.5 size-3.5 shrink-0 text-primary" /> <span className="min-w-0 wrap-anywhere">{answered}</span></p>
      ) : (
        <>
          {options.length ? <div className="cb-stagger flex min-w-0 flex-wrap gap-1.5 pl-6">
            {options.map((option) => (
              <Button key={option} size="sm" variant="outline" className="h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal wrap-anywhere" disabled={disabled} onClick={() => onAnswer(part.toolCallId, option)}>{option}</Button>
            ))}
          </div> : null}
          {!options.length || part.input?.allowOther !== false ? (
            <form className="pl-6" onSubmit={(event) => { event.preventDefault(); if (other.trim()) onAnswer(part.toolCallId, other.trim()) }}>
              <InputGroup className="h-8">
                <InputGroupInput value={other} onChange={(event) => setOther(event.target.value)} placeholder={options.length ? "Something else…" : "Type your answer…"} aria-label={options.length ? "Other answer" : question} disabled={disabled} />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton type="submit" size="icon-xs" disabled={!other.trim() || disabled} aria-label="Send answer"><ArrowUpIcon /></InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          ) : null}
        </>
      )}
    </div>
  )
}

const THINKING_PHRASES = ["Naruvi is thinking", "Working on it", "Figuring this out"]

/** Ticks on its own, so the once-a-second update re-renders one span, not the whole indicator. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return seconds >= 3 ? <span className="cb-pop text-xs text-muted-foreground tabular-nums">{seconds}s</span> : null
}

/** Naruvi beside a quiet typing bubble; the phrase and timer only appear if it takes a while. */
function ThinkingIndicator({ startedAt }: { startedAt: number | null }) {
  const reduced = !!useReducedMotion()
  const [mountedAt] = useState(() => Date.now())
  const [phraseIndex, setPhraseIndex] = useState(0)
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setPhraseIndex((i) => (i + 1) % THINKING_PHRASES.length), 3500)
    return () => clearInterval(timer)
  }, [reduced])
  const phrase = THINKING_PHRASES[phraseIndex]!
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-center gap-2.5"
      role="status"
      aria-label="Naruvi is thinking"
    >
      <NaruviAvatar size={26} />
      <span className="naruvi-typing" aria-hidden="true"><i /><i /><i /></span>
      <span className="flex items-baseline gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
        <span key={phrase} className="naruvi-thinking-phrase">{phrase}</span>
        <Elapsed since={startedAt ?? mountedAt} />
      </span>
    </motion.div>
  )
}

function PendingActivity({ label, className, analyzing = false }: { label: string; className?: string; analyzing?: boolean }) {
  if (!analyzing) return <AiStatus state="thinking" label={label} timer={false} className={cn("text-xs", className)} />
  // Real work (drafting, analyzing) can take a minute: show it's alive and for how long.
  return (
    <div className={cn("flex items-center gap-2 text-muted-foreground", className)} role="status">
      <DotmCircular5 size={16} dotSize={2} color="currentColor" ariaLabel={label} />
      <AITextLoading texts={[label]} label={label} showElapsed className="justify-start gap-2 text-xs font-medium text-muted-foreground [&>span:last-child]:text-[11px]" />
    </div>
  )
}

/* ───────────────────────────── actions ───────────────────────────── */

type Input = Record<string, unknown>
type Action = { icon: LucideIcon; title: (input: Input) => string; details: (input: Input) => string[]; approve: string; working: string; done: (output: Input) => string; destructive?: boolean; note?: string }
const s = (value: unknown) => (typeof value === "string" ? value : "")
const LANG: Record<string, string> = { en: "English", fr: "French", de: "German", es: "Spanish", it: "Italian", pt: "Portuguese", nl: "Dutch", ar: "Arabic" }
const STAGE: Record<string, string> = { submitted: "Sent", interviewing: "Interviewing", offer: "Offer", rejected: "Rejected", withdrawn: "Withdrawn" }
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })

const PROFILE_DETAIL_LABELS: Record<string, string> = {
  fullName: "name", email: "email", phone: "phone", location: "location", availability: "availability",
}

function profileEditValue(value: unknown) {
  if (value && typeof value === "object" && "label" in value && "url" in value) {
    return `${s(value.label)} · ${s(value.url)}`
  }
  return s(value) || "None"
}

const ACTIONS: Record<string, Action> = {
  edit_profile_details: {
    icon: UserPenIcon,
    title: (i) => {
      if (i.kind === "link") return !i.previous ? "Add a profile link" : !i.value ? "Remove a profile link" : "Update a profile link"
      return `Update profile ${PROFILE_DETAIL_LABELS[s(i.field)] ?? "detail"}`
    },
    details: (i) => [`Current: ${profileEditValue(i.previous)}`, `After approval: ${profileEditValue(i.value)}`],
    approve: "Apply change", working: "Updating profile details", done: () => "Profile updated",
  },
  add_profile_fact: {
    icon: UserPenIcon, title: (i) => `Add a fact to ${s(i.label)}`,
    details: (i) => [s(i.statement), Array.isArray(i.skills) && i.skills.length ? `Skills: ${i.skills.join(", ")}` : ""],
    approve: "Save fact", working: "Updating the profile",
    done: (o) => o.added || o.skillsAdded ? o.verified ? "Profile updated" : "Saved. Entry needs verification." : "Already on this entry",
  },
  update_application: {
    icon: CalendarClockIcon, title: (i) => s(i.label) || "Update application",
    details: (i) => [i.status ? `Stage → ${STAGE[s(i.status)]}` : "", i.nextStep ? `Next step → ${s(i.nextStep)}` : "", i.nextStepDue ? `Due → ${day(s(i.nextStepDue))}` : "", i.archived === true ? "Archive it" : i.archived === false ? "Restore it" : ""],
    approve: "Apply", working: "Updating", done: () => "Updated",
  },
  add_job_from_link: {
    icon: BriefcaseBusinessIcon, title: () => "Add this job", details: (i) => [s(i.url) || "From the pasted posting"],
    approve: "Read and save", working: "Reading the posting", done: (o) => (o.saved ? `Saved ${s(o.title)}${o.company ? ` at ${s(o.company)}` : ""}` : "Already saved, nothing added"),
  },
  start_application: {
    icon: GaugeIcon, title: (i) => `Start application · ${s(i.label)}`, details: () => ["Analyzes your fit against your verified facts"],
    approve: "Check fit", working: "Checking your fit", done: (o) => (typeof o.fit === "number" ? `Application started · fit ${o.fit}` : "Application started"),
  },
  draft_cv: {
    icon: FileTextIcon, title: (i) => `Draft CV · ${s(i.label)}`, details: (i) => [LANG[s(i.language)] ?? s(i.language), "Only from verified facts"],
    approve: "Draft CV", working: "Drafting the CV (about a minute)", done: () => "CV drafted",
  },
  draft_letter: {
    icon: MailIcon, title: (i) => `Draft cover letter · ${s(i.label)}`, details: (i) => [LANG[s(i.language)] ?? s(i.language), s(i.notes)],
    approve: "Draft cover letter", working: "Drafting the cover letter", done: () => "Cover letter drafted",
  },
  research_company: {
    icon: GlobeIcon, title: (i) => `Research · ${s(i.label)}`, details: () => ["Reads the company’s public website"],
    approve: "Research", working: "Reading their website", done: (o) => (o.researched ? "Research ready" : "Couldn’t find enough on their site"),
  },
  add_contact: {
    icon: UserPlusIcon, title: (i) => `Add ${s(i.name)}`, details: (i) => [[s(i.title), s(i.companyName)].filter(Boolean).join(" · "), s(i.email) || s(i.linkedinUrl)],
    approve: "Add contact", working: "Adding", done: () => "Added to contacts",
  },
  update_contact: {
    icon: UserPenIcon, title: (i) => `Update ${s(i.name) || "contact"}`, details: (i) => Object.entries(i).filter(([key, value]) => key !== "id" && value).map(([key, value]) => `${key === "companyName" ? "Company" : key[0].toUpperCase() + key.slice(1)} → ${String(value)}`),
    approve: "Save", working: "Saving", done: () => "Contact updated",
  },
  delete_contact: {
    icon: Trash2Icon, title: (i) => `Delete ${s(i.name)}`, details: () => ["Removes them from Naruvi and their links to applications"],
    approve: "Delete", working: "Deleting", done: () => "Deleted", destructive: true,
  },
  link_contact: {
    icon: LinkIcon, title: (i) => s(i.label) || "Link contact", details: (i) => [s(i.role) ? `As ${s(i.role)}` : ""],
    approve: "Link", working: "Linking", done: () => "Linked",
  },
  find_contact_email: {
    icon: MailSearchIcon, title: (i) => `Find ${s(i.name)}’s email`, details: (i) => [s(i.website) ? `Website → ${s(i.website)}` : "", "Sends their name and company domain to Hunter.io"],
    approve: "Find email", working: "Looking it up", done: (o) => (o.needsWebsite ? `Needs ${s(o.company)}’s website first` : o.email ? `Found ${s(o.email)}${typeof o.confidence === "number" ? ` · ${o.confidence}% confidence` : ""}` : "No email found"),
  },
  add_company: {
    icon: Building2Icon, title: (i) => `Add ${s(i.name)}`, details: (i) => [s(i.website) ? `Website → ${s(i.website)}` : "No website yet"],
    approve: "Add company", working: "Adding the company", done: () => "Company added",
  },
  set_company_website: {
    icon: GlobeIcon, title: (i) => `${s(i.name)}’s website`, details: (i) => [`Website → ${s(i.website)}`],
    approve: "Save website", working: "Saving", done: (o) => `Saved ${s(o.website)}`,
  },
  spontaneous_application: {
    icon: SendIcon, title: (i) => `Spontaneous application · ${s(i.companyName)}`, details: (i) => [s(i.role) || "Open application", LANG[s(i.language)] ?? "", s(i.context), s(i.careersUrl)],
    approve: "Create", working: "Creating the application", done: () => "Application created",
  },
}

function ActionCard({ part, busy, stale, onApproval, onNavigate }: { part: ToolPart; busy: boolean; stale: boolean; onApproval: (id: string, approved: boolean) => void; onNavigate: () => void }) {
  const action = ACTIONS[toolName(part)]
  const input = part.input ?? {}
  if (part.state === "input-streaming") return busy ? <PendingActivity label="Preparing a suggestion" /> : null
  const Icon = action.icon
  const details = action.details(input).filter(Boolean)
  const state = part.state
  // A suggestion the conversation moved past without an answer counts as skipped.
  const skipped = state === "approval-requested" && stale
  const asking = state === "approval-requested" && !stale
  const running = state === "approval-responded" || state === "input-available"
  const declined = skipped || state === "output-denied" || (state === "approval-responded" && part.approval?.approved === false)
  const done = state === "output-available"
  const failed = state === "output-error"
  const href = done && typeof part.output?.href === "string" ? part.output.href : null
  const title = action.title(input)
  const approvalId = part.approval?.id

  if (asking && approvalId) {
    return (
      <AIToolApproval
        className="cb-step max-w-none"
        calls={[{ id: approvalId, tool: toolName(part), title, input: details, destructive: action.destructive, approveLabel: action.approve, state: "approval-requested", icon: <Icon className="size-3.5" /> }]}
        onRespond={(id, approved) => onApproval(id, approved)}
      />
    )
  }

  if (done || declined) {
    const Icon = done ? CheckIcon : BanIcon
    return (
      <div className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/25 p-2 text-xs">
        <Icon aria-hidden className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer rounded-sm py-0.5 font-medium focus-visible:outline-2 focus-visible:outline-ring">
            {title} <span className="font-normal text-muted-foreground">· {done ? action.done(part.output ?? {}) : skipped ? "Skipped" : "Declined"}</span>
          </summary>
          {details.length ? <ul className="mt-1.5 grid gap-1 text-muted-foreground">{details.map((line, index) => <li key={index}>{line}</li>)}</ul> : null}
        </details>
        {href ? <Button size="xs" variant="outline" nativeButton={false} render={<Link href={href} onClick={onNavigate} />}>Open <ArrowRightIcon /></Button> : null}
      </div>
    )
  }

  return (
    <div className={cn("cb-step grid gap-2 rounded-xl border bg-card p-3 text-sm transition-colors", asking && "border-foreground/25")}>
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-px flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/40", action.destructive && "text-destructive")}>
          <Icon className="size-3.5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="font-medium break-words">{title}</span>
          {details.map((line) => <span key={line} className="text-xs break-words text-muted-foreground">{line}</span>)}
        </div>
      </div>


      {running && busy ? (
        <PendingActivity analyzing label={action.working} className="ps-9.5" />
      ) : null}
      {failed ? <p className="flex items-start gap-1.5 pl-9.5 text-xs text-destructive"><CircleAlertIcon className="mt-px size-3.5 shrink-0" /> {part.errorText || "That didn’t work."}</p> : null}
    </div>
  )
}
