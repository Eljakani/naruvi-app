"use client"

import Link from "next/link"
import { useEffect, useId, useState, useSyncExternalStore, useTransition } from "react"
import { ArrowUpRightIcon, ChevronDownIcon, FileTextIcon, Loader2Icon, MailIcon, PaperclipIcon, ReplyIcon, SendIcon, SparklesIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"
import { composeContextAction, draftMailAction, sendMailAction } from "@/app/(app)/applications/actions"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { InterviewCalendar } from "@/components/mail/interview-calendar"
import AITextLoading from "@/components/kokonutui/ai-text-loading"
import UndoButton from "@/components/kokonutui/undo-button"
import { NaruviAvatar, Otter } from "@/components/naruvi/otter"
import { Segmented } from "@/components/ui/segmented"
import { ruleKind } from "@/lib/mail-classify"
import { splitQuoted } from "@/lib/mail-quote"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Kbd } from "@/components/ui/kbd"
import { COMPOSE_LABEL, type ComposeKind } from "@/lib/mail-templates"
import type { MailDraft, DraftMailInput } from "@/lib/mail-draft"
import { cn } from "@/lib/utils"
import type { ComposeContext } from "@/server/mail/send"

const PURPOSE_HELP: Record<ComposeKind, string> = {
  reply: "Respond to the latest conversation",
  follow_up: "Ask about progress or the next step",
  thank_you: "Send a thoughtful note after meeting",
  apply: "Introduce yourself and your application",
}

/** One-click instructions that fit the email being answered, so nobody starts from a blank box. */
function quickIntents(kind: ComposeKind, latest: { subject: string; text: string; kind?: string | null } | null): string[] {
  if (kind === "apply") return ["Keep it short and mention the attached CV", "Mention who referred me", "Explain why this company in one line"]
  if (kind === "thank_you") return ["Thank them for their time and the conversation", "Say I’m still very interested and look forward to next steps"]
  if (kind === "follow_up") return ["Ask politely where things stand", "Confirm I’m still interested and available"]
  const received = latest ? (latest.kind && latest.kind !== "other" ? latest.kind : ruleKind(latest.subject, latest.text)) : "other"
  if (received === "interview") return ["Accept and offer Tuesday or Thursday afternoon", "Accept and ask for the format and who I’ll meet", "Ask to move it to next week"]
  if (received === "offer") return ["Thank them and ask for the written offer", "Thank them and ask for a few days to decide", "Accept the offer"]
  if (received === "rejection") return ["Thank them and ask for brief feedback", "Thank them and ask to keep me in mind"]
  if (received === "info_request") return ["Answer their questions briefly", "Send the details they asked for"]
  return ["Thank them and answer briefly", "Ask what the next step is"]
}

export type PrefilledEmailDraft = MailDraft & { kind: ComposeKind; replyTo: string | null; instructions?: string; language?: DraftMailInput["language"] }

/** Application menu and per-message reply share the same context-aware composer. */
export function ComposeEmail({ applicationId, connected, hasReplies, replyToId, initialDraft }: { applicationId: string; connected: boolean; hasReplies: boolean; replyToId?: string; initialDraft?: PrefilledEmailDraft }) {
  const [kind, setKind] = useState<ComposeKind | null>(null)
  const kinds: ComposeKind[] = hasReplies ? ["reply", "follow_up", "thank_you", "apply"] : ["apply", "follow_up", "thank_you"]
  if (!connected) return <Button variant="outline" size={replyToId ? "sm" : "default"} nativeButton={false} render={<Link href="/integrations" />}><MailIcon /> Connect email</Button>
  return <>
    {replyToId || initialDraft ? <Button variant="outline" size="sm" onClick={() => setKind(initialDraft?.kind ?? "reply")}><ReplyIcon /> {initialDraft ? "Review email" : "Reply"}</Button> : <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}><MailIcon /> Write email <ChevronDownIcon /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {kinds.map((item) => <DropdownMenuItem key={item} onClick={() => setKind(item)} className="items-start gap-3 py-2.5">
          {item === "reply" ? <ReplyIcon className="mt-0.5" /> : item === "apply" ? <SendIcon className="mt-0.5" /> : <MailIcon className="mt-0.5" />}
          <span className="grid gap-1"><span>{COMPOSE_LABEL[item]}</span><span className="text-xs text-muted-foreground">{PURPOSE_HELP[item]}</span></span>
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>}
    {kind ? <ComposeDialog key={`${kind}-${replyToId ?? "latest"}`} applicationId={applicationId} kind={kind} replyToId={replyToId ?? initialDraft?.replyTo ?? undefined} initialDraft={initialDraft} onClose={() => setKind(null)} /> : null}
  </>
}

function ComposeDialog({ applicationId, kind, replyToId, initialDraft, onClose }: { applicationId: string; kind: ComposeKind; replyToId?: string; initialDraft?: PrefilledEmailDraft; onClose: () => void }) {
  const id = useId()
  const [context, setContext] = useState<ComposeContext | null>(null)
  const [loadError, setLoadError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [instructions, setInstructions] = useState("")
  const [tone, setTone] = useState<DraftMailInput["tone"]>("professional")
  const [language, setLanguage] = useState<DraftMailInput["language"]>("auto")
  const [attachCv, setAttachCv] = useState(false)
  const [attachLetter, setAttachLetter] = useState(false)
  const [missing, setMissing] = useState<string[]>([])
  const [previous, setPrevious] = useState<{ subject: string; body: string; missing: string[] } | null>(null)
  const [sent, setSent] = useState<{ messageId: string; interviewRelated: boolean } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [aiError, setAiError] = useState("")
  const [sending, startSend] = useTransition()
  const [drafting, startDraft] = useTransition()
  const [queued, setQueued] = useState(false)
  const [restored, setRestored] = useState(false)
  const isMac = useSyncExternalStore(noSubscribe, () => /Mac|iPhone|iPad/.test(navigator.platform), () => true)
  const draftKey = `naruvi:mail-draft:${applicationId}:${kind}:${replyToId ?? "latest"}`
  const busy = sending || drafting || queued
  const placeholders = missing.length > 0 && /\[[^\]\n]{2,160}\]/.test(body)

  useEffect(() => {
    let current = true
    void composeContextAction(applicationId, kind, replyToId).then((next) => {
      if (!current) return
      if (!next) return setLoadError("This application is no longer available.")
      setContext(next)
      setTo(next.to)
      setSubject(initialDraft?.subject ?? next.subject)
      setBody(initialDraft?.body ?? next.body)
      if (initialDraft) { setMissing(initialDraft.missingDetails); setInstructions(initialDraft.instructions ?? ""); setLanguage(initialDraft.language ?? "auto"); setDirty(true) }
      else {
        // An unsent draft from last time comes back instead of the template.
        const saved = readDraft(draftKey)
        if (saved) { setTo(saved.to || next.to); setCc(saved.cc); setShowCc(Boolean(saved.cc)); setSubject(saved.subject); setBody(saved.body); setRestored(true); setDirty(true) }
      }
      setAttachCv(!initialDraft && kind === "apply" && Boolean(next.attachments.cv))
      setAttachLetter(!initialDraft && kind === "apply" && Boolean(next.attachments.letter))
    }).catch(() => { if (current) setLoadError("Couldn’t load your email draft. Try again.") })
    return () => { current = false }
  }, [applicationId, kind, replyToId, initialDraft, attempt, draftKey])

  // Keep the unsent draft, so closing the window or a crash doesn't lose it.
  useEffect(() => {
    if (!dirty || sent) return
    const timer = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ to, cc, subject, body })) } catch { /* Storage unavailable. */ } }, 400)
    return () => clearTimeout(timer)
  }, [dirty, sent, draftKey, to, cc, subject, body])
  const forget = () => { try { localStorage.removeItem(draftKey) } catch { /* Nothing stored. */ } }

  const close = () => { if (!busy) { if (dirty) setDiscard(true); else onClose() } }
  const edit = (set: (value: string) => void, value: string) => { set(value); setDirty(true) }
  const generate = (override?: string) => startDraft(async () => {
    setAiError("")
    try {
      const result = await draftMailAction({ applicationId, kind, replyTo: context?.replyTo ?? null, instructions: override ?? instructions, tone, language, subject, body, attachCv, attachLetter })
      if (!result.ok) return setAiError(result.message)
      setPrevious({ subject, body, missing })
      setSubject(result.draft.subject)
      setBody(result.draft.body)
      setMissing(result.draft.missingDetails)
      setDirty(true)
      toast.success("Draft ready", { description: "Review the wording and any details to complete." })
    } catch { setAiError("Couldn’t reach the drafting service. Your message is unchanged. Try again.") }
  })
  const send = () => startSend(async () => {
    setQueued(false)
    try {
      const result = await sendMailAction({ applicationId, kind, to, cc, subject, body, attachCv, attachLetter, replyTo: context?.replyTo ?? null })
      if (!result.ok) return void toast.error("Not sent", { description: result.message })
      toast.success("Email sent", { description: "A copy is saved on this application." })
      forget()
      setDirty(false)
      if (result.sentMessageId && result.interviewRelated) setSent({ messageId: result.sentMessageId, interviewRelated: true })
      else onClose()
    } catch { toast.error("Couldn’t confirm delivery", { description: "Check your Sent folder before trying again." }) }
  })

  const canSend = Boolean(context?.canSend) && !drafting && Boolean(to.trim() && subject.trim() && body.trim()) && !placeholders
  const ideas = context?.aiConfigured ? quickIntents(kind, context.latestEmail ? { subject: context.latestEmail.subject, text: context.latestEmail.text, kind: context.latestEmail.kind } : null) : []
  const replyName = context?.latestEmail?.from.replace(/\s*<.*>$/, "").trim()
  const title = sent ? "Email sent" : kind === "reply" && replyName ? `Reply to ${replyName}` : COMPOSE_LABEL[kind]
  const hint = drafting ? "Naruvi is writing from your context…" : queued ? "Sending in a moment. Undo if you changed your mind." : !context?.canSend ? "Connect outgoing email to send." : placeholders ? "Fill in the bracketed details first." : restored ? "Restored your unsent draft." : "You get 5 seconds to undo after sending."
  // ⌘/Ctrl+Enter sends, through the same undo window as the button.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canSend && !busy) {
      event.preventDefault()
      document.getElementById(`${id}-send`)?.click()
    }
  }

  return <>
    <Dialog open onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent showCloseButton={!busy} onKeyDown={onKeyDown} className="h-[min(48rem,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-3.5 pr-12">
          <DialogTitle className="truncate">{title}</DialogTitle>
          <DialogDescription>{context ? `${context.application.company} · ${context.application.title}` : "Preparing your email…"}</DialogDescription>
        </DialogHeader>
        {sent ? <div className="grid content-start gap-4 overflow-y-auto p-5"><div className="cb-enter flex items-end gap-3"><Otter pose="celebrating-progress" height={96} /><div className="grid gap-1 pb-2"><p className="font-medium">Sent. Nicely done.</p><p className="text-sm text-muted-foreground">A copy is saved on this application. If they proposed a time, save it to your calendar below.</p></div></div><InterviewCalendar applicationId={applicationId} messageId={sent.messageId} /></div> : loadError ? <div className="grid gap-3 p-6" role="alert"><p>{loadError}</p><Button variant="outline" className="w-fit" onClick={() => { setLoadError(""); setAttempt((value) => value + 1) }}>Try again</Button></div> : context ? <div className="grid min-h-0 md:grid-cols-[minmax(0,1fr)_18rem]">
          {/* The message: one scroll, mail-client style header rows, and a body that takes the rest of the height. */}
          <form id={id} className="flex min-h-0 min-w-0 flex-col overflow-y-auto" onSubmit={(event) => event.preventDefault()}>
            {!context.canSend ? <p className="border-b bg-destructive/5 px-5 py-2 text-sm text-destructive">Outgoing email isn’t connected. <Link href="/integrations" className="underline underline-offset-4">Set up sending</Link></p> : null}
            {context.latestEmail && kind !== "apply" ? <OriginalEmail email={context.latestEmail} /> : null}
            <fieldset disabled={busy} className="flex min-h-0 min-w-0 flex-1 flex-col">
              <HeaderRow label="From"><span className="truncate py-2 text-sm text-muted-foreground" title={context.from ?? ""}>{context.from || "your connected mailbox"}</span></HeaderRow>
              <HeaderRow label="To" htmlFor={`${id}-to`} end={showCc ? null : <button type="button" className="rounded px-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCc(true)}>Cc</button>}>
                <input id={`${id}-to`} required maxLength={2000} value={to} onChange={(event) => edit(setTo, event.target.value)} placeholder="recruiter@company.com" autoFocus={!to} className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </HeaderRow>
              {showCc ? <HeaderRow label="Cc" htmlFor={`${id}-cc`}><input id={`${id}-cc`} maxLength={2000} value={cc} onChange={(event) => edit(setCc, event.target.value)} placeholder="Other recipients, comma separated" autoFocus className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></HeaderRow> : null}
              <HeaderRow label="Subject" htmlFor={`${id}-subject`}>
                <input id={`${id}-subject`} required maxLength={300} value={subject} onChange={(event) => edit(setSubject, event.target.value)} className="h-10 w-full min-w-0 bg-transparent text-sm font-medium outline-none" />
              </HeaderRow>
              <div className="relative flex min-h-64 flex-1 flex-col">
                <label htmlFor={`${id}-body`} className="sr-only">Message</label>
                <textarea key={previous ? `${previous.body.length}-${body.length}` : "body"} id={`${id}-body`} required maxLength={20_000} className={cn("min-h-64 w-full flex-1 resize-none bg-transparent px-5 py-4 text-sm leading-relaxed outline-none transition-opacity duration-200", previous && !drafting && "cb-fade", drafting && "opacity-30")} value={body} onChange={(event) => edit(setBody, event.target.value)} autoFocus={Boolean(to)} placeholder="Write your message, or let Naruvi draft it." />
                {drafting ? <div className="pointer-events-none absolute inset-0 grid place-content-center justify-items-center gap-2"><Otter pose="working-on-it" height={84} /><AITextLoading texts={["Reading their email", "Finding the right words", "Keeping it short"]} label="Naruvi is drafting your email" className="text-sm" /></div> : null}
              </div>
              {missing.length > 0 ? <div className="mx-5 mb-3 grid gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs" role="status"><p className="font-medium">Check before sending</p><ul className="list-disc space-y-1 pl-4">{missing.map((detail) => <li key={detail}>{detail}</li>)}</ul>{placeholders ? <p>Replace the bracketed details in your message.</p> : null}</div> : null}
              <fieldset className="flex flex-wrap items-center gap-2 border-t px-5 py-2.5"><legend className="sr-only">Attachments</legend><PaperclipIcon className="size-3.5 text-muted-foreground" aria-hidden /><Attachment label="CV" checked={attachCv} onChange={(value) => { setAttachCv(value); setDirty(true) }} available={Boolean(context.attachments.cv)} /><Attachment label="Cover letter" checked={attachLetter} onChange={(value) => { setAttachLetter(value); setDirty(true) }} available={Boolean(context.attachments.letter)} /></fieldset>
            </fieldset>
          </form>
          {/* Naruvi: one click on an idea writes the draft; your own words and the tone are there when you want them. */}
          <aside className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto border-t bg-muted/30 p-4 md:border-t-0 md:border-l">
            <div className="flex items-center gap-2.5"><NaruviAvatar size={30} /><div className="grid"><h3 className="text-sm font-medium">Let Naruvi draft it</h3><p className="text-xs text-muted-foreground">{kind === "apply" ? "From this job and your verified facts." : "From their email. No CV recap: they’ve read it."}</p></div></div>
            {context.aiConfigured ? <>
              <div className="grid gap-1.5" role="group" aria-label="Write it for me with one of these">
                {ideas.map((idea) => <button key={idea} type="button" disabled={busy} onClick={() => { setInstructions(idea); setDirty(true); generate(idea) }} className={cn("group flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-start text-xs transition-colors hover:border-brand/40 hover:bg-brand-soft disabled:opacity-50", instructions === idea && previous && "border-brand/50 bg-brand-soft")}><SparklesIcon className="size-3.5 shrink-0 text-brand" aria-hidden /><span className="flex-1">{idea}</span></button>)}
              </div>
              <div className="grid gap-2">
                <label htmlFor={`${id}-instructions`} className="text-xs font-medium">Or say it in your words</label>
                <Textarea id={`${id}-instructions`} rows={3} maxLength={4000} disabled={busy} className="min-h-20 resize-none bg-background text-sm" value={instructions} onChange={(event) => edit(setInstructions, event.target.value)} placeholder={kind === "reply" ? "Dates, a question, a detail to mention…" : kind === "thank_you" ? "Who you met and what you discussed…" : "Details the email should include…"} />
                <div className="flex items-center gap-2">
                  <Segmented<"professional" | "warm" | "concise"> label="Tone" size="xs" className="flex-1 [&>button]:flex-1 [&>button]:justify-center" value={tone ?? "professional"} onChange={(value) => setTone(value)} options={[{ value: "professional", label: "Formal" }, { value: "warm", label: "Warm" }, { value: "concise", label: "Short" }]} />
                  <select aria-label="Language" disabled={busy} value={language} onChange={(event) => setLanguage(event.target.value as DraftMailInput["language"])} className="h-7 w-16 rounded-md border bg-background px-1 text-xs focus-visible:outline-2 focus-visible:outline-ring"><option value="auto">Auto</option><option value="en">EN</option><option value="fr">FR</option><option value="de">DE</option><option value="es">ES</option><option value="ar">AR</option></select>
                </div>
                <Button type="button" disabled={busy} onClick={() => generate()} className="bg-brand text-brand-foreground hover:bg-brand/90">{drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}{drafting ? "Writing…" : previous ? "Rewrite" : "Write it for me"}</Button>
                {previous ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setSubject(previous.subject); setBody(previous.body); setMissing(previous.missing); setPrevious(null); setAiError("") }}><Undo2Icon /> Back to my version</Button> : null}
                {aiError ? <p role="alert" className="text-xs text-destructive">{aiError}</p> : null}
              </div>
            </> : <p className="text-xs text-muted-foreground"><Link href="/integrations#ai" className="inline-flex items-center gap-1 underline underline-offset-4">Connect an AI model <ArrowUpRightIcon className="size-3" /></Link> to draft and refine emails. You can still write your own message.</p>}
          </aside>
        </div> : <div className="grid gap-4 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-64" /></div>}
        {sent ? <DialogFooter className="m-0 rounded-none px-5 py-3"><Button onClick={onClose}>Done</Button></DialogFooter> : <DialogFooter className="m-0 shrink-0 items-center gap-3 rounded-none px-5 py-3">
          <p className="me-auto text-xs text-muted-foreground" aria-live="polite">{hint}</p>
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex" aria-hidden><Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd><Kbd>↵</Kbd></span>
          <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
          {sending ? <Button disabled><Loader2Icon className="animate-spin" /> Sending…</Button> : <UndoButton id={`${id}-send`} label="Send email" doneLabel="Sent" icon={SendIcon} resetAfter={null} disabled={!canSend} onAction={() => setQueued(true)} onUndo={() => setQueued(false)} onCommit={send} />}
        </DialogFooter>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard this draft?</AlertDialogTitle><AlertDialogDescription>Your unsent message and drafting notes will be lost.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { forget(); onClose() }}>Discard draft</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>
}

const noSubscribe = () => () => {}

function readDraft(key: string): { to: string; cc: string; subject: string; body: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null")
    return value && typeof value.body === "string" && value.body.trim() ? { to: String(value.to ?? ""), cc: String(value.cc ?? ""), subject: String(value.subject ?? ""), body: value.body } : null
  } catch { return null }
}

function Attachment({ label, checked, onChange, available }: { label: string; checked: boolean; onChange: (value: boolean) => void; available: boolean }) {
  const on = checked && available
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={!available}
      title={available ? undefined : "Generate it first on this application"}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-[background-color,border-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        on ? "border-foreground/20 bg-foreground text-background" : "bg-background hover:bg-muted",
      )}
    >
      <FileTextIcon className="size-3.5" /> {label} · PDF
      {!available ? <span className="text-muted-foreground">· not made yet</span> : on ? <span aria-hidden>✓</span> : null}
    </button>
  )
}

/** The email being answered: a two-line preview you can open in place. Quotes folded away, no scroll inside a scroll. */
function OriginalEmail({ email }: { email: { subject: string; from: string; text: string } }) {
  const [open, setOpen] = useState(false)
  const { body } = splitQuoted(email.text)
  return (
    <div className="border-b bg-muted/30 px-5 py-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="grid w-full min-w-0 gap-1 text-start">
        <span className="flex min-w-0 items-center gap-2 text-xs">
          <ReplyIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate"><span className="font-medium">{email.from.replace(/\s*<.*>$/, "")}</span> <span className="text-muted-foreground">· {email.subject}</span></span>
          <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">{open ? "Hide" : "Show"} email<ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} /></span>
        </span>
        <span dir="auto" className={cn("text-xs leading-5 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]", !open && "line-clamp-2")}>{open ? body : body.replace(/\s+/g, " ").trim()}</span>
      </button>
    </div>
  )
}

/** A mail-client header line: label on the left, a borderless field filling the row. */
function HeaderRow({ label, htmlFor, end, children }: { label: string; htmlFor?: string; end?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b px-5 focus-within:bg-muted/30">
      {htmlFor ? <label htmlFor={htmlFor} className="w-14 shrink-0 text-xs text-muted-foreground">{label}</label> : <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>}
      <div className="flex min-w-0 flex-1">{children}</div>
      {end}
    </div>
  )
}
