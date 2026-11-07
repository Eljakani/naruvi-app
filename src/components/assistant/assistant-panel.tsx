"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useChat } from "@ai-sdk/react"
import { Collapsible } from "@animate-ui/react/primitives/base-ui/collapsible"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls, type FileUIPart, type InferUITools, type UIMessage } from "ai"
import { useReducedMotion } from "motion/react"
import { createContext, lazy, memo, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  ArrowRightIcon, ArrowUpIcon, BanIcon, BriefcaseBusinessIcon, CalendarClockIcon, CheckIcon, ChevronDownIcon, CircleAlertIcon, FileTextIcon, GaugeIcon, GlobeIcon,
  ExternalLinkIcon, LinkIcon, MailIcon, MailSearchIcon, MessageCircleQuestionIcon, SendIcon, SparklesIcon, SquarePenIcon, Trash2Icon, UserPenIcon, UserPlusIcon, UserRoundIcon, XIcon,
  type LucideIcon,
} from "lucide-react"
import { FitRing } from "@/components/applications/fit-ring"
import AIPrompt from "@/components/kokonutui/ai-prompt"
import AITextLoading from "@/components/kokonutui/ai-text-loading"
import AIToolApproval from "@/components/kokonutui/ai-tool-approval"
import { DotmCircular5 } from "@/components/ui/dotm-circular-5"
import { DotmSquare3 } from "@/components/ui/dotm-square-3"
import { EntryLogo } from "@/components/profile/entry-logo"
import { AiStatus, AiStatusIcon } from "@/components/ui/ai-status"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Message, MessageContent } from "@/components/ui/message"
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { CHAT_IMAGE_BYTES, CHAT_IMAGE_TYPES, limitChatImages } from "@/lib/assistant-images"
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

export function AssistantSidebarItem() {
  const { open, toggle } = useContext(AssistantContext)
  return (
    <SidebarMenuButton tooltip="Ask Naruvi (Ctrl+J)" aria-controls={PANEL_ID} aria-expanded={open} isActive={open} onClick={toggle}>
      <SparklesIcon />
      <span>Ask Naruvi</span>
      <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">Ctrl J</Kbd>
    </SidebarMenuButton>
  )
}

export function AssistantHeaderButton() {
  const { open, toggle } = useContext(AssistantContext)
  return (
    <Button id="assistant-toggle" size="sm" variant={open ? "secondary" : "ghost"} aria-label="Ask Naruvi" aria-controls={PANEL_ID} aria-expanded={open} onClick={toggle}>
      <SparklesIcon />
      <span className="hidden @min-[30rem]/workspace:inline">Ask Naruvi</span>
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
  const { messages, sendMessage, status, stop, error, clearError, setMessages, addToolOutput, addToolApprovalResponse } = useChat({
    messages: initial,
    transport,
    throttle: 32,
    sendAutomaticallyWhen: (options) => lastAssistantMessageIsCompleteWithApprovalResponses(options) || lastAssistantMessageIsCompleteWithToolCalls(options),
  })
  const busy = status === "submitted" || status === "streaming"
  const [draft, setDraft] = useState("")
  const [image, setImage] = useState<FileUIPart | null>(null)
  const [imageError, setImageError] = useState("")
  const [readingImage, setReadingImage] = useState(false)

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

  const send = (text: string, attachment?: FileUIPart) => {
    const value = text.trim()
    if ((!value && !attachment) || busy) return
    clearError()
    void sendMessage(attachment ? { parts: [...(value ? [{ type: "text" as const, text: value }] : []), attachment] } : { text: value })
  }
  const sendDraft = () => {
    if (busy || readingImage || (!draft.trim() && !image)) return
    send(draft, image ?? undefined)
    setDraft("")
    setImage(null)
    setImageError("")
  }
  const attachImage = (file: File) => {
    if (busy || readingImage) return
    if (!CHAT_IMAGE_TYPES.some((type) => type === file.type) || file.size > CHAT_IMAGE_BYTES || !file.size) {
      setImageError("Choose a PNG, JPEG, or WebP image up to 2 MB.")
      return
    }
    setImageError("")
    setReadingImage(true)
    const reader = new FileReader()
    reader.onload = () => setImage({ type: "file", mediaType: file.type, filename: file.name, url: String(reader.result) })
    reader.onerror = () => setImageError("Couldn’t read the image. Try attaching it again.")
    reader.onloadend = () => setReadingImage(false)
    reader.readAsDataURL(file)
  }
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
    void addToolOutput({ tool: "ask_user", toolCallId, output: { choice } } as never)
  }, [addToolOutput])
  const onApproval = useCallback((id: string, approved: boolean) => {
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


  return (
    <>
      <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b px-4 py-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
          <SparklesIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="assistant-title" className="text-sm font-semibold">Ask Naruvi</h2>
          <p key={context.label} className="cb-fade truncate text-xs text-muted-foreground">Looking at {context.label}</p>
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

      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label="Conversation" tabIndex={0} className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <MessageScrollerContent className="gap-5 px-4 py-5">
              {messages.length ? (
                messages.map((message) => (
                  <TranscriptMessage key={message.id} message={message} onNavigate={onNavigate} onAnswer={onAnswer} onApproval={onApproval} busy={busy && message.id === last?.id} stale={message.id !== last?.id} />
                ))
              ) : (
                <Welcome onPick={send} suggestions={context.suggestions} />
              )}
              {working ? (
                <MessageScrollerItem>
                  {writing ? <AiStatus state="writing" /> : <ThinkingIndicator />}
                </MessageScrollerItem>
              ) : null}
              {error ? (
                <MessageScrollerItem>
                  <Marker className="cb-step text-destructive">
                    <MarkerIcon><CircleAlertIcon /></MarkerIcon>
                    <MarkerContent>{friendlyError(error.message)}</MarkerContent>
                  </Marker>
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
        onAttach={([file, extra]) => {
          if (extra) setImageError("Attach one image at a time.")
          else if (file) attachImage(file)
        }}
        accept={CHAT_IMAGE_TYPES.join(",")}
        placeholder={messages.length ? "Reply, or ask something else…" : "Ask anything, or tell Naruvi what to do…"}
        responding={busy}
        readingAttachment={readingImage}
        canSend={!readingImage && Boolean(draft.trim() || image)}
        attachmentError={imageError}
        attachment={image ? (
          <div className="flex w-fit max-w-full min-w-0 items-center gap-2 rounded-lg border bg-muted/25 px-2 py-1.5">
            <ChatImage part={image} className="size-9 shrink-0 rounded object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs">{image.filename || "Attached image"}</span>
            <Button type="button" size="icon-xs" variant="ghost" aria-label="Remove image" onClick={() => { setImage(null); setImageError("") }}>
              <XIcon />
            </Button>
          </div>
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
    return "The AI model couldn’t process this image. Check that your model in Settings supports images."
  }
  if (/model|settings|api key/i.test(message)) return message
  return "Something went wrong. Try again, or check your AI model in Settings."
}

function Welcome({ onPick, suggestions }: { onPick: (text: string) => void; suggestions: Suggestion[] }) {
  // Sits just above the composer, where the eye already is, instead of floating mid-panel.
  return (
    <div className="flex flex-1 flex-col justify-end gap-4 pb-1">
      <div className="grid gap-1">
        <span className="mb-1 flex size-9 items-center justify-center rounded-xl border bg-muted/40">
          <SparklesIcon className="size-4.5" />
        </span>
        <p className="text-base font-semibold tracking-tight">What can I do for you?</p>
        <p className="text-sm text-muted-foreground">I read your jobs, applications, contacts and profile. Nothing changes until you approve it.</p>
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">Suggested</p>
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
    <MessageScrollerItem scrollAnchor={message.role === "user"}>
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

function AssistantMessage({ message, onNavigate, onAnswer, onApproval, busy, stale = false }: { message: UIMessage; onNavigate: () => void; onAnswer: (toolCallId: string, choice: string) => void; onApproval: (id: string, approved: boolean) => void; busy: boolean; stale?: boolean }) {
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
    else if (isTool(part) && toolName(part) === "open_page" && part.state === "output-available") blocks.push(<OpenButton key={index} path={String(part.input?.path ?? "/")} label={String(part.input?.label ?? "Open")} onNavigate={onNavigate} />)
    else if (isTool(part) && ACTIONS[toolName(part)]) blocks.push(<ActionCard key={index} part={part} busy={busy} stale={stale} onApproval={onApproval} onNavigate={onNavigate} />)
  })
  flush()
  return (
    <Message className="cb-step">
      <MessageContent className="grid w-full grid-cols-[minmax(0,1fr)] gap-2.5 wrap-anywhere">{blocks}</MessageContent>
    </Message>
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
        className="min-w-0 space-y-2 text-sm leading-relaxed wrap-anywhere [&_[data-streamdown=heading-1]]:text-base [&_[data-streamdown=heading-2]]:text-sm [&_[data-streamdown=heading-3]]:text-sm"
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
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
        <MessageCircleQuestionIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {question}
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

const THINKING = ["Thinking", "Reading your workspace", "Weighing options", "Putting it together"]

/** Dot-matrix loader with words that swap letter by letter, for the gap before a reply starts. */
function ThinkingIndicator() {
  return (
    <div className="cb-step flex items-center gap-2.5 text-foreground/80" role="status">
      <DotmSquare3 size={18} dotSize={3} color="currentColor" ariaLabel="Thinking" />
      <AITextLoading texts={THINKING} interval={1800} label="Naruvi is thinking" showElapsed className="justify-start gap-2 text-sm font-medium text-foreground/80 [&>span:last-child]:text-xs [&>span:last-child]:text-muted-foreground" />
    </div>
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
    approve: "Analyze fit", working: "Analyzing your fit", done: (o) => (typeof o.fit === "number" ? `Application started · fit ${o.fit}` : "Application started"),
  },
  draft_cv: {
    icon: FileTextIcon, title: (i) => `Draft CV · ${s(i.label)}`, details: (i) => [LANG[s(i.language)] ?? s(i.language), "Only from verified facts"],
    approve: "Draft CV", working: "Drafting the CV (about a minute)", done: () => "CV drafted",
  },
  draft_letter: {
    icon: MailIcon, title: (i) => `Draft letter · ${s(i.label)}`, details: (i) => [LANG[s(i.language)] ?? s(i.language), s(i.notes)],
    approve: "Draft letter", working: "Drafting the letter", done: () => "Letter drafted",
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
    icon: MailSearchIcon, title: (i) => `Find ${s(i.name)}’s email`, details: () => ["Sends their name and company domain to Hunter.io"],
    approve: "Find email", working: "Looking it up", done: (o) => (o.email ? `Found ${s(o.email)}${typeof o.confidence === "number" ? ` · ${o.confidence}% confidence` : ""}` : "No email found"),
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
