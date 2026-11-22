"use client"

import { ComposeEmail } from "@/components/mail/compose-email"
import { PresenceList } from "@/components/presence"
import Link from "next/link"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import { NaruviAvatar, Otter } from "@/components/naruvi/otter"
import { usePathname, useRouter } from "next/navigation"
import { useDirection } from "@base-ui/react/direction-provider"
import { useChat } from "@ai-sdk/react"
import { Collapsible } from "@animate-ui/react/primitives/base-ui/collapsible"
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls, type FileUIPart, type InferUITools, type UIMessage } from "ai"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useSyncExternalStore } from "react"
import { createContext, lazy, memo, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import {
  ArrowRightIcon, ArrowUpIcon, BanIcon, BriefcaseBusinessIcon, CalendarClockIcon, CheckIcon, ChevronDownIcon, CircleAlertIcon, FileTextIcon, GaugeIcon, GlobeIcon,
  CopyIcon, ExternalLinkIcon, LinkIcon, RotateCcwIcon, MailIcon, MailSearchIcon, SendIcon, SquarePenIcon, Trash2Icon, UserPenIcon, UserPlusIcon, UserRoundIcon, XIcon,
  Building2Icon, ArchiveIcon, BadgeCheckIcon, ShieldIcon, TagIcon, TargetIcon, FileUpIcon, UnlinkIcon, type LucideIcon,
} from "lucide-react"
import { FitRing } from "@/components/applications/fit-ring"
import AIPrompt from "@/components/kokonutui/ai-prompt"
import AITextLoading from "@/components/kokonutui/ai-text-loading"
import { ENTRY_KINDS, KIND_FIELDS, looseFields, normalizeEntryDraft, optionLabel, type EntryKind } from "@/lib/entry-fields"
import { ActionDetails, ActionFrame, type ActionBody, type ActionRow } from "@/components/assistant/action-frame"
import { DotmCircular5 } from "@/components/ui/dotm-circular-5"
import { EntryLogo } from "@/components/profile/entry-logo"
import { AiStatus, AiStatusIcon } from "@/components/ui/ai-status"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertAction, AlertDescription } from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
import { IconTile } from "@/components/reui/icon-tile"
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
import { toast } from "sonner"
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
  const t = useTranslations("assistantTrigger")
  const { open, toggle } = useContext(AssistantContext)
  const shortcut = useShortcutLabel()
  return (
    <SidebarMenuButton tooltip={t("shortcut", { shortcut })} aria-controls={PANEL_ID} aria-expanded={open} isActive={open} onClick={toggle}
      className="text-sidebar-foreground/75 hover:bg-sidebar-accent/60 data-active:text-sidebar-foreground">
      <NaruviAvatar size={16} className="-my-0.5" />
      <span>{t("ask")}</span>
      <Kbd className="ms-auto bg-transparent opacity-60 group-data-[collapsible=icon]:hidden">{shortcut}</Kbd>
    </SidebarMenuButton>
  )
}

export function AssistantHeaderButton() {
  const t = useTranslations("assistantTrigger")
  const { open, toggle } = useContext(AssistantContext)
  return (
    <Button
      id="assistant-toggle"
      size="sm"
      variant="ghost"
      aria-label={open ? t("close") : t("wake")}
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
      <span className="hidden text-sm @min-[30rem]/workspace:inline">{open ? t("open") : t("ask")}</span>
    </Button>
  )
}

export function AssistantPanel() {
  const { visited } = useContext(AssistantContext)
  return visited ? <DockedAssistant /> : <aside id={PANEL_ID} hidden />
}

function DockedAssistant() {
  const inlineDirection = useDirection() === "rtl" ? -1 : 1
  const { open, queued, close, clearQueue } = useContext(AssistantContext)
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY))
    return stored > 0 && Number.isFinite(stored) ? clampWidth(stored) : DEFAULT_WIDTH
  })
  const panel = useRef<HTMLElement>(null)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  const [resizing, setResizing] = useState(false)
  const tc = useTranslations("assistantChat")
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
        shown ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0 rtl:-translate-x-8",
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
        aria-label={tc("resize")}
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
          if (drag.current) resize(drag.current.startWidth + (drag.current.startX - event.clientX) * inlineDirection)
        }}
        onLostPointerCapture={() => { drag.current = null; setResizing(false) }}
        onKeyDown={(event) => {
          const current = panel.current?.offsetWidth ?? width
          const step = event.shiftKey ? 64 : 16
          const target = { ArrowLeft: current + step * inlineDirection, ArrowRight: current - step * inlineDirection, Home: MIN_WIDTH, End: MAX_WIDTH }[event.key]
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
function pageContext(path: string, t: ReturnType<typeof useTranslations<"assistantWelcome">>): { label: string; suggestions: Suggestion[] } {
  const general: Suggestion[] = [
    { icon: CalendarClockIcon, text: t("today") },
    { icon: GaugeIcon, text: t("bestFit") },
    { icon: SendIcon, text: t("spontaneous") },
    { icon: UserPlusIcon, text: t("recruiter") },
  ]
  if (/^\/applications\/[^/]+\/letter/.test(path)) return { label: t("letter"), suggestions: [{ icon: MailIcon, text: t("shorter") }, { icon: GlobeIcon, text: t("specific") }, { icon: UserRoundIcon, text: t("recipient") }] }
  if (/^\/applications\/[^/]+\/cv/.test(path)) return { label: t("cv"), suggestions: [{ icon: FileTextIcon, text: t("missingCv") }, { icon: GaugeIcon, text: t("weak") }, { icon: MailIcon, text: t("letterToo") }] }
  if (/^\/applications\/[^/]+/.test(path)) return { label: t("application"), suggestions: [{ icon: GaugeIcon, text: t("progress") }, { icon: MailIcon, text: t("draftLetter") }, { icon: CalendarClockIcon, text: t("followUp") }, { icon: UserRoundIcon, text: t("who") }] }
  if (/^\/jobs\/[^/]+/.test(path) && !path.startsWith("/jobs/new")) return { label: t("job"), suggestions: [{ icon: GaugeIcon, text: t("fit") }, { icon: BriefcaseBusinessIcon, text: t("start") }, { icon: GlobeIcon, text: t("research") }] }
  if (path.startsWith("/jobs")) return { label: t("jobs"), suggestions: [{ icon: GaugeIcon, text: t("bestFit") }, { icon: BriefcaseBusinessIcon, text: t("jobLink") }, { icon: CalendarClockIcon, text: t("notApplied") }] }
  if (path.startsWith("/contacts")) return { label: t("contacts"), suggestions: [{ icon: UserPlusIcon, text: t("recruiter") }, { icon: MailSearchIcon, text: t("noEmail") }, { icon: SendIcon, text: t("spontaneous") }] }
  if (path.startsWith("/companies")) return { label: t("companies"), suggestions: [{ icon: GlobeIcon, text: t("mostApplied") }, { icon: SendIcon, text: t("spontaneous") }] }
  if (path.startsWith("/profile")) return { label: t("profile"), suggestions: [{ icon: UserRoundIcon, text: t("missingProfile") }, { icon: FileTextIcon, text: t("noFacts") }, { icon: GaugeIcon, text: t("skills") }] }
  if (path === "/applications") return { label: t("applications"), suggestions: [{ icon: CalendarClockIcon, text: t("noNews") }, { icon: GaugeIcon, text: t("nextApp") }, { icon: SendIcon, text: t("spontaneous") }] }
  return { label: t("dashboard"), suggestions: general }
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
  const t = useTranslations("assistantWelcome")
  const tc = useTranslations("assistantChat")
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
      valid.length < files.length ? tc("imageTypes") : "",
      valid.length > accepted.length ? tc("imageMax", { limit: CHAT_IMAGE_MAX }) : "",
    ].filter(Boolean)
    setImageError(problems.join(". "))
    if (!accepted.length) return
    setReadingImage(true)
    Promise.all(accepted.map(readImage))
      .then((parts) => setImages((current) => [...current, ...parts].slice(0, CHAT_IMAGE_MAX)))
      .catch(() => setImageError(tc("imageRead")))
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
    isReadTool(toolName(part)) || ACTIONS[toolName(part)] || toolName(part) === "ask_user"
  ) && (
    part.state === "input-streaming" || part.state === "input-available" ||
    part.state === "approval-requested" ||
    (part.state === "approval-responded" && part.approval?.approved)
  ))
  const working = busy && !toolOwnsStatus
  // Safe here: the panel only renders after the user opens it, never while prerendering.
  const context = pageContext(usePathname(), t)
  const writing = status === "streaming" && latestStep.some((part) => part.type === "text" && part.state === "streaming" && part.text.trim())
  const mood = !busy ? null : writing ? t("writing") : toolOwnsStatus ? t("working") : t("thinking")
  const retry = () => { setTurnStartedAt(Date.now()); clearError(); void regenerate() }
  // Starting over is one press, so it can be taken back for a few seconds.
  const startOver = () => {
    const previous = messages
    clearError()
    setMessages([])
    sessionStorage.removeItem(STORAGE)
    toast(tc("cleared"), { action: { label: tc("undo"), onClick: () => setMessages(previous) } })
  }


  return (
    <>
      <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b px-4 py-2">
        <NaruviAvatar size={32} />
        <div className="min-w-0 flex-1">
          <h2 id="assistant-title" className="text-sm font-semibold">Naruvi</h2>
          <p key={mood ?? context.label} aria-live="polite" className={cn("cb-fade truncate text-xs", mood ? "font-medium text-brand" : "text-muted-foreground")}>
            {mood ?? t("context", { page: context.label })}
          </p>
        </div>
        {messages.length ? (
          <Button size="icon-sm" variant="ghost" aria-label={t("newChat")} title={t("newChat")} disabled={busy} onClick={startOver}>
            <SquarePenIcon />
          </Button>
        ) : null}
        <Button size="icon-sm" variant="ghost" aria-label={t("close")} title={t("close")} onClick={onClose}>
          <XIcon />
        </Button>
      </header>

      {/* Open at the latest message; when you send, your question anchors at the top while the reply streams below. */}
      <MessageScrollerProvider defaultScrollPosition="end">
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label={tc("conversation")} tabIndex={0} className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
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
                  <Alert variant="destructive" className="cb-step">
                    <AlertDescription className="text-pretty text-foreground">{friendlyError(error.message, tc)}</AlertDescription>
                    <AlertAction className="col-start-2 mt-2 flex-wrap justify-start sm:col-start-2 sm:row-start-auto sm:justify-start">
                      <Button size="xs" onClick={retry}><RotateCcwIcon /> {tc("tryAgain")}</Button>
                      {/model|settings|api key/i.test(error.message) ? <Button size="xs" variant="outline" nativeButton={false} render={<Link href="/integrations#ai" onClick={onNavigate} />}>{tc("aiSettings")}</Button> : null}
                    </AlertAction>
                  </Alert>
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
        placeholder={busy ? (followUp ? t("queuedPlaceholder") : t("followUpPlaceholder")) : messages.length ? t("replyPlaceholder") : t("askPlaceholder")}
        responding={busy}
        queued={followUp ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="mb-2 flex items-center gap-2 rounded-xl border bg-muted/40 py-1.5 ps-3 pe-1 text-xs">
            <span className="shrink-0 font-medium text-brand">{tc("upNext")}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{followUp}</span>
            <button type="button" aria-label={tc("editFollowUp")} title={tc("editFollowUp")} onClick={() => { setDraft(followUp); setFollowUp(null) }} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><SquarePenIcon className="size-3.5" /></button>
            <button type="button" aria-label={tc("cancelFollowUp")} title={tc("cancelFollowUp")} onClick={() => setFollowUp(null)} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><XIcon className="size-3.5" /></button>
          </motion.div>
        ) : null}
        readingAttachment={readingImage}
        canSend={busy ? Boolean(draft.trim()) : !readingImage && Boolean(draft.trim() || images.length)}
        attachmentError={imageError}
        dropLabels={{ wait: tc("dropWait"), reading: tc("dropReading"), full: tc("imageMax", { limit: CHAT_IMAGE_MAX }), drop: tc("dropHere") }}
        attachment={images.length ? (
          <ul className="flex flex-wrap gap-2" aria-label={tc("attached")}>
            <PresenceList>
              {images.map((part, index) => (
                <motion.li key={part.url.slice(-48) + index} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }} className="group/thumb relative">
                  <ChatImage part={part} className="size-14 rounded-lg border object-cover" />
                  <button
                    type="button"
                    aria-label={tc("removeImage", { name: part.filename || tc("imageN", { n: index + 1 }) })}
                    title={tc("removeImage", { name: part.filename || tc("imageN", { n: index + 1 }) })}
                    onClick={() => { setImages((current) => current.filter((_, i) => i !== index)); setImageError("") }}
                    className="absolute -top-1.5 -end-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-xs transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
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
  const t = useTranslations("assistantChat")
  // eslint-disable-next-line @next/next/no-img-element -- local attachment preview uses an inline data URL
  return <img src={part.url} alt={part.filename || t("attachedImage")} className={className} />
}

function friendlyError(message: string, t: ReturnType<typeof useTranslations<"assistantChat">>) {
  if (/image|vision|multimodal/i.test(message)) return t("errorImage")
  // A message about the model or its key says what to fix, so it is shown as it came.
  if (/model|settings|api key/i.test(message)) return message
  return t("errorGeneric")
}

const greeting = (): "late" | "morning" | "afternoon" | "evening" => {
  const hour = new Date().getHours()
  return hour < 5 ? "late" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"
}

function Welcome({ onPick, suggestions, label }: { onPick: (text: string) => void; suggestions: Suggestion[]; label: string }) {
  const t = useTranslations("assistantWelcome")
  const [hello] = useState(greeting)
  // Sits just above the composer, where the eye already is, instead of floating mid-panel.
  return (
    <div className="flex flex-1 flex-col justify-end gap-4 pb-1">
      <div className="cb-step flex items-end gap-1">
        <div className="relative -mb-1 shrink-0">
          <span className="absolute inset-x-3 bottom-0 h-5 rounded-[50%] bg-brand/15 blur-md" aria-hidden />
          <Otter pose="concept" height={132} className="relative" priority />
        </div>
        <div className="relative mb-6 grid gap-1 rounded-2xl rounded-es-sm border bg-background px-3.5 py-3 shadow-xs">
          <p className="text-base font-semibold tracking-tight">{t(hello)}</p>
          <p className="text-sm text-pretty text-muted-foreground">{t("intro")}</p>
        </div>
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("ideas", { page: label })}</p>
        <ul key={suggestions[0]?.text} className="cb-stagger grid divide-y overflow-hidden rounded-xl border bg-background">
          {suggestions.map(({ icon: Icon, text }) => (
            <li key={text}>
              <button type="button" onClick={() => onPick(text)} className="group/suggestion flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-start text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
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

const READS = [
  "what_needs_attention",
  "list_applications",
  "get_application",
  "search_jobs",
  "get_job",
  "list_companies",
  "get_company",
  "read_careers_page",
  "list_contacts",
  "profile_overview",
  "read_profile_details",
  "find_profile_entries",
  "get_profile_entry",
  "read_search_goals",
  "list_job_leads",
  "salary_for_job",
  "check_mail",
] as const

const isReadTool = (name: string): name is (typeof READS)[number] => READS.some((tool) => tool === name)

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
  const t = useTranslations("assistantChat")
  // Consecutive look-ups collapse into one trace; everything else renders in order.
  const blocks: ReactNode[] = []
  // The card owns the outcome for this turn, including after an approval changes state.
  const isAction = (part: Part): part is ToolPart => isTool(part) && Object.hasOwn(ACTIONS, toolName(part))
  const lastAction = message.parts.findLastIndex(isAction)
  // Before a card, its words would only repeat it. Once every card is settled, what Naruvi says next
  // (what it found, what to do now) is the point of the turn, so it shows.
  const shows = (index: number) => lastAction < 0 || (index > lastAction && message.parts.every((part) => !isAction(part) || settled(part)))
  let reads: ToolPart[] = []
  const flush = () => {
    if (reads.length) blocks.push(<ReadTrace key={`reads-${blocks.length}`} parts={reads} busy={busy} />)
    reads = []
  }
  message.parts.forEach((part, index) => {
    if (isTool(part) && isReadTool(toolName(part))) return void reads.push(part)
    flush()
    if (part.type === "text" && part.text.trim() && shows(index)) blocks.push(<Markdown key={index} text={part.text} onNavigate={onNavigate} streaming={busy && part.state === "streaming"} />)
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
        blocks.push(<div key={index} className="cb-step grid min-w-0 gap-3 rounded-xl border bg-card p-3 text-sm">
          <div className="flex items-start gap-2.5">
            <IconTile variant="soft" size="sm" className="text-muted-foreground"><MailIcon aria-hidden /></IconTile>
            <div className="grid min-w-0 flex-1 gap-0.5"><p className="font-medium wrap-anywhere">{t("emailDraft", { company: draft.company })}</p><p className="text-xs text-muted-foreground wrap-anywhere">{draft.to ? t("emailTo", { to: draft.to }) : t("emailChoose")}</p></div>
          </div>
          <p className="font-medium wrap-anywhere">{draft.subject}</p>
          <p dir="auto" className="max-h-64 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{draft.body}</p>
          {draft.missingDetails.length ? <p className="text-xs text-muted-foreground">{t("emailMissing", { list: draft.missingDetails.join(" · ") })}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2"><Badge variant="outline" size="sm">{t("emailNote")}</Badge><ComposeEmail applicationId={draft.applicationId} connected={draft.canSend} hasReplies={Boolean(draft.replyTo)} initialDraft={draft} /></div>
        </div>)
      } else if (part.state === "output-error") blocks.push(<p key={index} role="alert" className="text-sm text-destructive">{part.errorText || t("emailFailed")}</p>)
      else if (busy) blocks.push(<PendingActivity key={index} label={t("emailDrafting")} />)
    }
    else if (isTool(part) && toolName(part) === "open_page" && part.state === "output-available") blocks.push(<OpenButton key={index} path={String(part.input?.path ?? "/")} label={String(part.input?.label ?? t("open"))} onNavigate={onNavigate} />)
    else if (isTool(part) && ACTIONS[toolName(part)]) blocks.push(<ActionCard key={index} part={part} busy={busy} stale={stale} onApproval={onApproval} onNavigate={onNavigate} />)
  })
  flush()
  const text = message.parts.flatMap((part, index) => part.type === "text" && shows(index) ? [part.text.trim()] : []).filter(Boolean).join("\n\n")
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
  const t = useTranslations("assistantChat")
  const [copied, setCopied] = useState(false)
  const button = "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
  return (
    <div className="naruvi-reply-actions -ms-2 -mt-1 flex items-center gap-0.5">
      {text ? (
        <button type="button" className={button} onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
        }}>
          {copied ? <CheckIcon className="cb-pop size-3.5 text-brand" /> : <CopyIcon className="size-3.5" />}<span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
        </button>
      ) : null}
      {onRetry ? <button type="button" className={button} onClick={onRetry}><RotateCcwIcon className="size-3.5" />{t("askAgain")}</button> : null}
    </div>
  )
}

type ApplicationResult = Awaited<ReturnType<typeof apiApplications>>["applications"][number]
type ProfileResult = NonNullable<InferUITools<typeof assistantTools>["show_profile"]["output"]["profile"]>

function ProfileCard({ profile, onNavigate }: { profile: ProfileResult; onNavigate: () => void }) {
  const t = useTranslations("assistantChat")
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
        <span className="text-muted-foreground">{t("profileVerified", { verified: profile.verified, entries: profile.entries })}</span>
        <span className="inline-flex items-center gap-1 font-medium group-hover/result:underline">
          {t("openProfile")} <ArrowRightIcon aria-hidden className="size-3.5 rtl:rotate-180" />
        </span>
      </div>
    </Link>
  )
}

function ApplicationResults({ applications, onNavigate }: { applications: ApplicationResult[]; onNavigate: () => void }) {
  const t = useTranslations("assistantResults")
  const status = useTranslations("labels.status")
  return (
    <ul aria-label={t("applications")} className="grid gap-2">
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
              <Badge variant={application.archived ? "outline" : application.status === "ready" ? "primary-light" : application.status === "offer" ? "success-light" : "outline"} className="mt-1">
                {application.archived ? t("archived") : status.has(application.status) ? status(application.status) : application.stage}
              </Badge>
            </div>
            {application.fit != null ? <FitRing score={application.fit} /> : null}
            <ArrowRightIcon aria-hidden className="mt-2 size-4 shrink-0 text-muted-foreground transition-transform group-hover/result:translate-x-0.5 rtl:rotate-180 rtl:group-hover/result:-translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ReadTrace({ parts, busy }: { parts: ToolPart[]; busy: boolean }) {
  const t = useTranslations("assistantResults")
  const reducedMotion = useReducedMotion()
  const steps = parts.flatMap((part) => {
    const name = toolName(part)
    if (!isReadTool(name)) return []
    const pending = part.state === "input-streaming" || part.state === "input-available"
    const failed = part.state === "output-error" || Boolean(part.output?.error) || (toolName(part) === "read_careers_page" && part.output?.page === null)
    return [{ part, pending, failed, label: failed ? t("failed") : t(`reads.${name}.${pending ? "running" : "done"}`) }]
  }).filter((step) => busy || !step.pending)
  if (!steps.length) return null
  const active = steps.find((step) => step.pending)
  const failed = steps.filter((step) => step.failed).length
  const settled = steps.filter((step) => !step.pending).length
  const rows = (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      {steps.map(({ part, pending, failed, label }) => {
        const source = !pending && !failed && toolName(part) === "read_careers_page"
          ? (part.output?.page as { url?: string; title?: string } | null | undefined)
          : null
        return (
          <div key={part.toolCallId} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5">
            {pending ? (
              <AiStatus state="researching" label={label} timer={false} className="text-xs" />
            ) : (
              <TraceLine status={failed ? "error" : undefined} className="text-xs">
                <TraceIcon>{failed ? <CircleAlertIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}</TraceIcon>
                <TraceTitle>{label}</TraceTitle>
                {!failed ? <TraceDescription>{countOf(part.output, t)}</TraceDescription> : null}
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
      <Collapsible.Trigger className="group/activity flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        {active ? <span aria-hidden><AiStatusIcon state="researching" /></span> : failed ? <CircleAlertIcon className="size-3.5 shrink-0 text-destructive" /> : <CheckIcon className="size-3.5 shrink-0" />}
        <span className="min-w-0 flex-1 font-medium">{active ? active.label : failed ? t("failures", { count: failed }) : t("completed", { count: steps.length })}</span>
        {active ? <span className="shrink-0 tabular-nums">{t("progress", { settled, total: steps.length })}</span> : null}
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
    <a href={url.href} target="_blank" rel="noreferrer" title={source.title || url.hostname} className="ms-6 inline-flex w-fit min-w-0 max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
      <GlobeIcon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{source.title || url.hostname}</span>
      <ExternalLinkIcon aria-hidden className="size-3 shrink-0" />
    </a>
  )
}

function countOf(output: Record<string, unknown> | undefined, t: ReturnType<typeof useTranslations<"assistantResults">>) {
  if (!output) return null
  for (const key of ["applications", "jobs", "contacts", "companies", "entries", "attention"] as const) {
    const value = output[key]
    if (Array.isArray(value)) return t(`counts.${key}`, { count: value.length })
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
    <Button variant="outline" size="sm" className="cb-step h-auto min-h-8 w-fit max-w-full py-1.5 text-start whitespace-normal wrap-anywhere" nativeButton={false} render={<Link href={path} onClick={onNavigate} />}>
      {label} <ArrowRightIcon className="rtl:rotate-180" />
    </Button>
  )
}

/* ───────────────────────────── ask the user ───────────────────────────── */

function AskCard({ part, onAnswer, disabled }: { part: ToolPart; onAnswer: (toolCallId: string, choice: string) => void; disabled: boolean }) {
  const t = useTranslations("assistantChat")
  const [other, setOther] = useState("")
  const question = String(part.input?.question ?? "")
  const options = (part.input?.options as string[] | undefined) ?? []
  const answered = part.state === "output-available" ? String(part.output?.choice ?? "") : null
  if (part.state === "input-streaming") return <PendingActivity label={t("preparingQuestion")} />
  return (
    <div className="cb-step grid gap-2.5 rounded-xl border bg-card p-3">
      <p className="text-sm font-medium text-pretty wrap-anywhere">{question}</p>
      {answered !== null ? (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><CheckIcon className="cb-pop mt-0.5 size-3.5 shrink-0 text-primary" /> <span className="min-w-0 wrap-anywhere">{answered}</span></p>
      ) : (
        <>
          {options.length ? <div className="cb-stagger grid min-w-0 gap-1.5">
            {options.map((option) => (
              <Button key={option} size="sm" variant="outline" className="h-auto min-h-9 w-full justify-start py-1.5 text-start whitespace-normal wrap-anywhere" disabled={disabled} onClick={() => onAnswer(part.toolCallId, option)}>{option}</Button>
            ))}
          </div> : null}
          {!options.length || part.input?.allowOther !== false ? (
            <form onSubmit={(event) => { event.preventDefault(); if (other.trim()) onAnswer(part.toolCallId, other.trim()) }}>
              <InputGroup className="h-8">
                <InputGroupInput value={other} onChange={(event) => setOther(event.target.value)} placeholder={options.length ? t("otherPlaceholder") : t("answerPlaceholder")} aria-label={options.length ? t("otherLabel") : question} disabled={disabled} />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton type="submit" size="icon-xs" disabled={!other.trim() || disabled} aria-label={t("sendAnswer")}><ArrowUpIcon /></InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          ) : null}
        </>
      )}
    </div>
  )
}

const THINKING_PHRASES = ["thinking", "working", "figuring"] as const

/** Ticks on its own, so the once-a-second update re-renders one span, not the whole indicator. */
function Elapsed({ since }: { since: number }) {
  const format = useFormatter()
  const [now, setNow] = useState(since)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return seconds >= 3 ? <span className="cb-pop text-xs text-muted-foreground tabular-nums">{format.number(seconds, { style: "unit", unit: "second", unitDisplay: "narrow" })}</span> : null
}

/** Naruvi beside a quiet typing bubble; the phrase and timer only appear if it takes a while. */
function ThinkingIndicator({ startedAt }: { startedAt: number | null }) {
  const t = useTranslations("assistantWelcome.thinkingPhrases")
  const reduced = !!useReducedMotion()
  const [mountedAt] = useState(() => Date.now())
  const [phraseIndex, setPhraseIndex] = useState(0)
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(() => setPhraseIndex((i) => (i + 1) % THINKING_PHRASES.length), 3500)
    return () => clearInterval(timer)
  }, [reduced])
  const phrase = t(THINKING_PHRASES[phraseIndex]!)
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      className="flex items-center gap-2.5"
      role="status"
      aria-label={t("thinking")}
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
type Values = Record<string, string | number>
/** What an action needs to describe itself in the reader's language. */
type Ctx = {
  /** A string of this action, e.g. `t("title", { label })`. */
  t: (key: string, values?: Values) => string
  /** A string shared by several actions. */
  common: (key: string, values?: Values) => string
  language: (code: string) => string
  stage: (status: string) => string
  day: (iso: string) => string
  /** A profile field's label ("Company"), from the entry editor's own words. */
  field: (kind: string, key: string) => string
  /** A profile entry kind, singular ("Experience"). */
  kind: (kind: string) => string
  locale: string
}
type Action = {
  icon: LucideIcon
  title: (input: Input, c: Ctx) => string
  details: (input: Input, c: Ctx) => string[]
  /** Structured proposal (labelled fields, facts, skills) where plain lines would read as raw data. */
  body?: (input: Input, c: Ctx) => Partial<ActionBody>
  /** One line under the title, e.g. the kind of entry. */
  subtitle?: (input: Input, c: Ctx) => string
  done: (output: Input, c: Ctx) => string
  destructive?: boolean
}
const s = (value: unknown) => (typeof value === "string" ? value : "")
const n = (value: unknown) => (typeof value === "number" ? value : 0)
const list = (value: unknown) => (Array.isArray(value) ? value.map(s).filter(Boolean) : [])
const pairs = (value: unknown) => Object.entries((value ?? {}) as Record<string, unknown>)
/** A date range field ("2021 – present"), or plain text. */
const fieldValue = (value: unknown, open: string) => {
  if (typeof value !== "object" || !value) return s(value)
  const range = value as Record<string, unknown>
  return [s(range.start), s(range.end) || open].filter(Boolean).join(" – ")
}

/** A proposed entry as labelled rows, sorted into the kind's real fields the way the server will save it. */
function entryRows(i: Input, c: Ctx, open: string): ActionRow[] {
  const kind = (ENTRY_KINDS as readonly string[]).includes(s(i.kind)) ? (s(i.kind) as EntryKind) : null
  if (!kind) return [...pairs(i.text), ...pairs(i.fields)].map(([key, value]) => ({ label: key, value: fieldValue(value, open) || c.common("cleared") }))
  const draft = normalizeEntryDraft(kind, s(i.language) || "en", i.text, i.fields)
  const langs = Object.keys(draft.display)
  const rows: ActionRow[] = []
  for (const spec of KIND_FIELDS[kind]) {
    if (spec.translated) {
      for (const lang of langs) {
        const value = draft.display[lang][spec.key]
        if (value !== undefined) rows.push({ label: c.field(kind, spec.key), value: value || c.common("cleared"), hint: langs.length > 1 ? lang : undefined })
      }
    } else if (spec.key in draft.fields) {
      const value = draft.fields[spec.key]
      // Dates written as text ("Mar 2026 – present") read the way the server will store them.
      const stored = typeof value === "string" && (spec.type === "dates" || spec.type === "month") ? looseFields(kind, { [spec.key]: value })[spec.key] ?? value : value
      const shown = fieldValue(stored, open)
      rows.push({ label: c.field(kind, spec.key), value: (spec.type === "select" ? optionLabel(shown, c.locale) : shown) || c.common("cleared") })
    }
  }
  for (const key of draft.unknown) rows.push({ label: key, value: c.common("unknownField") })
  return rows
}

function useActionCtx(name: string): Ctx {
  const t = useTranslations("assistantActions")
  const tf = useTranslations("entryEditor.kindFields")
  const tk = useTranslations("profileLabels.kindSingular")
  const status = useTranslations("labels.status")
  const locale = useLocale()
  return useMemo(() => {
    const say = (key: string, values?: Values) => t(key as never, values as never) as string
    return {
      t: (key, values) => say(`${name}.${key}`, values),
      common: (key, values) => say(`common.${key}`, values),
      language: (code) => {
        if (!code) return ""
        try { return new Intl.DisplayNames(locale, { type: "language" }).of(code) ?? code } catch { return code }
      },
      stage: (value) => (status.has(value as never) ? status(value as never) : value),
      day: (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }),
      field: (kind, key) => (tf.has(`${kind}.${key}.label` as never) ? (tf(`${kind}.${key}.label` as never) as string) : key),
      kind: (kind) => (tk.has(kind as never) ? (tk(kind as never) as string) : kind),
      locale,
    }
  }, [t, tf, tk, status, locale, name])
}

const ACTIONS: Record<string, Action> = {
  edit_profile_details: {
    icon: UserPenIcon,
    title: (i, c) => {
      if (i.kind === "link") return c.t(!i.previous ? "titleAdd" : !i.value ? "titleRemove" : "titleLink")
      return c.t("title", { field: s(i.field) || "other" })
    },
    details: (i, c) => {
      const show = (value: unknown) => (value && typeof value === "object" && "label" in value && "url" in value ? `${s(value.label)} · ${s(value.url)}` : s(value) || c.common("none"))
      return [c.t("current", { value: show(i.previous) }), c.t("after", { value: show(i.value) })]
    },
    done: (_, c) => c.t("done"),
  },
  edit_profile_entry: {
    icon: UserPenIcon, title: (i, c) => s(i.label) || c.t("title"),
    details: () => [],
    body: (i, c) => ({ rows: entryRows(i, c, c.common("present")) }),
    done: (o, c) => c.t("done", { name: s(o.name) }),
  },
  create_profile_entry: {
    icon: UserPenIcon, title: (i, c) => s(i.label) || c.kind(s(i.kind)),
    subtitle: (i, c) => c.t("subtitle", { kind: c.kind(s(i.kind)) }),
    details: () => [],
    body: (i, c) => ({ rows: entryRows(i, c, c.common("present")), facts: list(i.facts), skills: list(i.skills) }),
    done: (o, c) => c.t("done", { name: s(o.name) }),
  },
  add_profile_fact: {
    icon: UserPenIcon, title: (i, c) => c.t("title", { label: s(i.label) }),
    details: (i) => [s(i.statement)],
    body: (i) => ({ skills: list(i.skills) }),
    done: (o, c) => c.t(o.added || o.skillsAdded ? (o.verified ? "done" : "doneUnverified") : "doneExisting"),
  },
  update_application: {
    icon: CalendarClockIcon, title: (i, c) => s(i.label) || c.t("title"),
    details: (i, c) => [
      i.status ? c.t("stage", { value: c.stage(s(i.status)) }) : "",
      i.nextStep ? c.t("nextStep", { value: s(i.nextStep) }) : "",
      i.nextStepDue ? c.t("due", { value: c.day(s(i.nextStepDue)) }) : "",
      i.archived === true ? c.t("archive") : i.archived === false ? c.t("restore") : "",
    ],
    done: (_, c) => c.t("done"),
  },
  add_job_from_link: {
    icon: BriefcaseBusinessIcon, title: (_, c) => c.t("title"), details: (i, c) => [s(i.url) || c.t("detail")],
    done: (o, c) => (!o.saved ? c.t("doneExisting") : o.company ? c.t("doneAt", { title: s(o.title), company: s(o.company) }) : c.t("done", { title: s(o.title) })),
  },
  start_application: {
    icon: GaugeIcon, title: (i, c) => c.t("title", { label: s(i.label) }), details: (_, c) => [c.t("detail")],
    done: (o, c) => (typeof o.fit === "number" ? c.t("doneFit", { fit: o.fit }) : c.t("done")),
  },
  draft_cv: {
    icon: FileTextIcon, title: (i, c) => c.t("title", { label: s(i.label) }), details: (i, c) => [c.language(s(i.language)), c.t("detail")],
    done: (_, c) => c.t("done"),
  },
  draft_letter: {
    icon: MailIcon, title: (i, c) => c.t("title", { label: s(i.label) }), details: (i, c) => [c.language(s(i.language)), s(i.notes)],
    done: (_, c) => c.t("done"),
  },
  research_company: {
    icon: GlobeIcon, title: (i, c) => c.t("title", { label: s(i.label) }), details: (_, c) => [c.t("detail")],
    done: (o, c) => c.t(o.researched ? "done" : "doneEmpty"),
  },
  add_contact: {
    icon: UserPlusIcon, title: (i, c) => c.t("title", { name: s(i.name) }), details: (i) => [[s(i.title), s(i.companyName)].filter(Boolean).join(" · "), s(i.email) || s(i.linkedinUrl)],
    done: (_, c) => c.t("done"),
  },
  update_contact: {
    icon: UserPenIcon, title: (i, c) => (s(i.name) ? c.t("title", { name: s(i.name) }) : c.t("titleFallback")),
    details: (i, c) => Object.entries(i).filter(([key, value]) => key !== "id" && value).map(([key, value]) => c.t("field", { field: key, value: String(value) })),
    done: (_, c) => c.t("done"),
  },
  set_entry_status: {
    icon: BadgeCheckIcon,
    title: (i, c) => c.t("title", { status: s(i.status) || "other", label: s(i.label) }),
    details: (i, c) => [c.t("detail", { status: s(i.status) || "other" })],
    done: (o, c) => c.t("done", { name: s(o.name), status: s(o.status) || "other" }),
  },
  delete_profile_entry: {
    icon: Trash2Icon, title: (i, c) => c.t("title", { label: s(i.label) }), details: (_, c) => [c.t("detail")],
    done: (o, c) => c.t("done", { name: s(o.name) }), destructive: true,
  },
  edit_profile_fact: {
    icon: UserPenIcon, title: (i, c) => c.t(s(i.statement) ? "title" : "titleRemove", { label: s(i.label) }),
    details: (i, c) => [s(i.statement) ? c.t("detail", { statement: s(i.statement) }) : c.t("detailRemove")],
    done: (o, c) => c.t(o.removed ? "doneRemoved" : "done"),
  },
  remove_entry_skills: {
    icon: UserPenIcon, title: (i, c) => c.t("title", { label: s(i.label) }), details: (i) => [list(i.skills).join(", ")],
    done: (o, c) => c.t("done", { count: n(o.removed) }),
  },
  set_entry_guards: {
    icon: ShieldIcon, title: (i, c) => s(i.label) || c.t("title"),
    details: (i, c) => [
      i.confidential === true ? c.t("nda") : i.confidential === false ? c.t("ndaOff") : "",
      ...list(i.addRules).map((rule) => `+ ${rule}`),
      ...list(i.removeRules).map((rule) => `− ${rule}`),
    ],
    done: (_, c) => c.t("done"),
  },
  save_search_goal: {
    icon: TargetIcon, title: (i, c) => s(i.label) || c.t("title"),
    details: (i, c) => {
      if (i.remove === true) return [c.t("remove")]
      const goal = (i.goal ?? {}) as Record<string, unknown>
      const row = (key: string) => (list(goal[key]).length ? c.t(key, { list: list(goal[key]).join(", ") }) : "")
      return [s(goal.name), row("roles"), row("contracts"), row("places"), row("workModes"), s(goal.startFrom) ? c.t("start", { value: s(goal.startFrom) }) : ""]
    },
    done: (_, c) => c.t("done"),
  },
  import_profile_text: {
    icon: FileUpIcon, title: (i, c) => c.t("title", { label: s(i.label) }), details: (i, c) => [c.t("chars", { count: s(i.text).length }), c.t("detail")],
    done: (o, c) => (o.skipped ? c.t("doneSkipped", { created: n(o.created), skipped: n(o.skipped) }) : c.t("done", { created: n(o.created) })),
  },
  dismiss_job_leads: {
    icon: ArchiveIcon, title: (i, c) => s(i.label) || c.t("title"), details: (i, c) => [c.t("detail", { count: Array.isArray(i.leadIds) ? i.leadIds.length : 0 })],
    done: (o, c) => c.t("done", { count: n(o.dismissed) }),
  },
  tag_job: {
    icon: TagIcon, title: (i, c) => c.t("title", { label: s(i.label) }), details: (i, c) => [list(i.tags).length ? list(i.tags).join(", ") : c.t("none")],
    done: (_, c) => c.t("done"),
  },
  revise_cv: {
    icon: FileTextIcon, title: (i, c) => c.t("title", { label: s(i.label) }), details: (i, c) => [s(i.request), c.t("detail", { language: c.language(s(i.language)) })],
    done: (o, c) => (o.changed ? c.t("done", { before: String(o.scoreBefore), after: String(o.scoreAfter) }) : s(o.note) || c.t("doneNone")),
  },
  unlink_contact: {
    icon: UnlinkIcon, title: (i, c) => s(i.label) || c.t("title"), details: (_, c) => [c.t("detail")],
    done: (_, c) => c.t("done"),
  },
  delete_contact: {
    icon: Trash2Icon, title: (i, c) => c.t("title", { name: s(i.name) }), details: (_, c) => [c.t("detail")],
    done: (_, c) => c.t("done"), destructive: true,
  },
  link_contact: {
    icon: LinkIcon, title: (i, c) => s(i.label) || c.t("title"), details: (i, c) => [s(i.role) ? c.t("detail", { role: s(i.role) }) : ""],
    done: (_, c) => c.t("done"),
  },
  find_contact_email: {
    icon: MailSearchIcon, title: (i, c) => c.t("title", { name: s(i.name) }), details: (i, c) => [s(i.website) ? c.common("website", { url: s(i.website) }) : "", c.t("detail")],
    done: (o, c) => (o.needsWebsite ? c.t("doneNeedsWebsite", { company: s(o.company) }) : !o.email ? c.t("doneNone") : typeof o.confidence === "number" ? c.t("doneConfidence", { email: s(o.email), confidence: o.confidence }) : c.t("done", { email: s(o.email) })),
  },
  add_company: {
    icon: Building2Icon, title: (i, c) => c.t("title", { name: s(i.name) }), details: (i, c) => [s(i.website) ? c.common("website", { url: s(i.website) }) : c.t("noWebsite")],
    done: (_, c) => c.t("done"),
  },
  set_company_website: {
    icon: GlobeIcon, title: (i, c) => c.t("title", { name: s(i.name) }), details: (i, c) => [c.common("website", { url: s(i.website) })],
    done: (o, c) => c.t("done", { website: s(o.website) }),
  },
  spontaneous_application: {
    icon: SendIcon, title: (i, c) => c.t("title", { company: s(i.companyName) }), details: (i, c) => [s(i.role) || c.t("open"), c.language(s(i.language)), s(i.context), s(i.careersUrl)],
    done: (_, c) => c.t("done"),
  },
}

/** An action has not settled while it is being written, awaits an answer, or runs. */
const settled = (part: ToolPart) => part.state === "output-available" || part.state === "output-error" || part.state === "output-denied" || (part.state === "approval-responded" && part.approval?.approved === false)

function ActionCard({ part, busy, stale, onApproval, onNavigate }: { part: ToolPart; busy: boolean; stale: boolean; onApproval: (id: string, approved: boolean) => void; onNavigate: () => void }) {
  const name = toolName(part)
  const action = ACTIONS[name]
  const c = useActionCtx(name)
  const t = useTranslations("assistantChat")
  const input = part.input ?? {}
  if (part.state === "input-streaming") return busy ? <PendingActivity label={t("preparing")} /> : null
  const Icon = action.icon
  const body: ActionBody = { rows: [], facts: [], skills: [], ...action.body?.(input, c), lines: action.details(input, c).filter(Boolean) }
  const hasBody = body.rows.length + body.lines.length + body.facts.length + body.skills.length > 0
  const labels = { needsApproval: t("needsApproval"), notNow: t("notNow"), hold: t("hold"), holdLabel: t("holdLabel"), destructive: t("destructive"), facts: t("facts"), skills: t("skills"), failed: t("failed") }
  const state = part.state
  // A suggestion the conversation moved past without an answer counts as skipped.
  const skipped = state === "approval-requested" && stale
  const asking = state === "approval-requested" && !stale
  const running = state === "approval-responded" || state === "input-available"
  const declined = skipped || state === "output-denied" || (state === "approval-responded" && part.approval?.approved === false)
  const done = state === "output-available"
  const failed = state === "output-error"
  const href = done && typeof part.output?.href === "string" ? part.output.href : null
  const title = action.title(input, c)
  const subtitle = action.subtitle?.(input, c)
  const approvalId = part.approval?.id

  // Settled: the outcome leads, what was asked folds under it, and the next place to go is one press away.
  if (done || declined) {
    return (
      <div className="cb-step flex min-w-0 items-center gap-2.5 rounded-xl border bg-card p-2.5">
        <IconTile variant="soft" size="sm" className={cn("self-start", done ? "text-success" : "text-muted-foreground")}>
          {done ? <CheckIcon aria-hidden className="cb-pop" /> : <BanIcon aria-hidden />}
        </IconTile>
        <details className="group/details min-w-0 flex-1 text-sm">
          <summary className={cn("grid list-none gap-0.5 rounded-sm focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden", hasBody ? "cursor-pointer" : "pointer-events-none")} tabIndex={hasBody ? undefined : -1}>
            <span className="leading-snug font-medium wrap-anywhere">{done ? action.done(part.output ?? {}, c) : title}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{done ? title : skipped ? t("skipped") : t("declined")}</span>
              {hasBody ? <ChevronDownIcon aria-label={t("details")} className="size-3 shrink-0 transition-transform duration-150 group-open/details:rotate-180 motion-reduce:transition-none" /> : null}
            </span>
          </summary>
          {hasBody ? <ActionDetails body={body} labels={labels} className="mt-2 border-t pt-2 text-xs" /> : null}
        </details>
        {href ? <Button size="sm" className="shrink-0 self-start" nativeButton={false} render={<Link href={href} onClick={onNavigate} />}>{t("open")} <ArrowRightIcon className="rtl:rotate-180" /></Button> : null}
      </div>
    )
  }

  return (
    <ActionFrame
      icon={<Icon aria-hidden />}
      title={title}
      subtitle={subtitle}
      body={body}
      labels={labels}
      destructive={action.destructive}
      approveLabel={c.t("approve")}
      state={asking && approvalId ? "asking" : failed ? "failed" : "running"}
      error={part.errorText}
      progress={running && busy ? <PendingActivity analyzing label={c.t("working")} /> : null}
      onRespond={approvalId ? (approved) => onApproval(approvalId, approved) : undefined}
    />
  )
}
