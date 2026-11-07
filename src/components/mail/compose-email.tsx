"use client"

import Link from "next/link"
import { useEffect, useId, useState, useTransition } from "react"
import { ArrowUpRightIcon, ChevronDownIcon, FileTextIcon, Loader2Icon, MailIcon, PaperclipIcon, ReplyIcon, SendIcon, SparklesIcon, Undo2Icon } from "lucide-react"
import { toast } from "sonner"
import { composeContextAction, draftMailAction, sendMailAction } from "@/app/(app)/applications/actions"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { InterviewCalendar } from "@/components/mail/interview-calendar"
import AITextLoading from "@/components/kokonutui/ai-text-loading"
import { NaruviAvatar, Otter } from "@/components/naruvi/otter"
import { Segmented } from "@/components/ui/segmented"
import { ruleKind } from "@/lib/mail-classify"
import { splitQuoted } from "@/lib/mail-quote"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
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
  const busy = sending || drafting
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
      setAttachCv(!initialDraft && kind === "apply" && Boolean(next.attachments.cv))
      setAttachLetter(!initialDraft && kind === "apply" && Boolean(next.attachments.letter))
    }).catch(() => { if (current) setLoadError("Couldn’t load your email draft. Try again.") })
    return () => { current = false }
  }, [applicationId, kind, replyToId, initialDraft, attempt])

  const close = () => { if (!busy) { if (dirty) setDiscard(true); else onClose() } }
  const edit = (set: (value: string) => void, value: string) => { set(value); setDirty(true) }
  const generate = () => startDraft(async () => {
    setAiError("")
    try {
      const result = await draftMailAction({ applicationId, kind, replyTo: context?.replyTo ?? null, instructions, tone, language, subject, body, attachCv, attachLetter })
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
    try {
      const result = await sendMailAction({ applicationId, kind, to, cc, subject, body, attachCv, attachLetter, replyTo: context?.replyTo ?? null })
      if (!result.ok) return void toast.error("Not sent", { description: result.message })
      toast.success("Email sent", { description: "A copy is saved on this application." })
      setDirty(false)
      if (result.sentMessageId && result.interviewRelated) setSent({ messageId: result.sentMessageId, interviewRelated: true })
      else onClose()
    } catch { toast.error("Couldn’t confirm delivery", { description: "Check your Sent folder before trying again." }) }
  })

  return <>
    <Dialog open onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent showCloseButton={!busy} className="h-[min(52rem,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{sent ? "Email sent" : COMPOSE_LABEL[kind]}</DialogTitle>
          <DialogDescription>{context ? `${context.application.company} · ${context.application.title}` : "Preparing your email…"}</DialogDescription>
        </DialogHeader>
        {sent ? <div className="grid content-start gap-4 overflow-y-auto p-5"><div className="cb-enter flex items-end gap-3"><Otter pose="celebrating-progress" height={96} /><div className="grid gap-1 pb-2"><p className="font-medium">Sent. Nicely done.</p><p className="text-sm text-muted-foreground">A copy is saved on this application. If they proposed a time, save it to your calendar below.</p></div></div><InterviewCalendar applicationId={applicationId} messageId={sent.messageId} /></div> : loadError ? <div className="grid gap-3 p-6" role="alert"><p>{loadError}</p><Button variant="outline" className="w-fit" onClick={() => { setLoadError(""); setAttempt((value) => value + 1) }}>Try again</Button></div> : context ? <div className="grid min-h-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_17rem]">
          <form id={id} className="grid min-w-0 content-start gap-4 p-5" onSubmit={(event) => { event.preventDefault(); if (!busy && context.canSend && !placeholders) send() }}>
            {!context.canSend ? <p className="text-sm text-destructive">Outgoing email isn’t connected. <Link href="/integrations" className="underline underline-offset-4">Set up sending</Link></p> : null}
            {context.latestEmail && kind !== "apply" ? <OriginalEmail email={context.latestEmail} /> : null}
            <p className="truncate text-xs text-muted-foreground" title={context.from ?? ""}>From {context.from || "your connected mailbox"}</p>
            <fieldset disabled={busy} className="grid min-w-0 gap-3">
              <div className="flex items-end gap-2"><Field className="min-w-0 flex-1"><FieldLabel htmlFor={`${id}-to`}>To</FieldLabel><Input id={`${id}-to`} required maxLength={2000} value={to} onChange={(event) => edit(setTo, event.target.value)} placeholder="recruiter@company.com" autoFocus={!to} /></Field><Button type="button" variant="ghost" size="sm" aria-expanded={showCc} onClick={() => setShowCc(!showCc)}>Cc</Button></div>
              {showCc ? <Field><FieldLabel htmlFor={`${id}-cc`}>Cc</FieldLabel><Input id={`${id}-cc`} maxLength={2000} value={cc} onChange={(event) => edit(setCc, event.target.value)} placeholder="Optional recipients" /></Field> : null}
              <Field><FieldLabel htmlFor={`${id}-subject`}>Subject</FieldLabel><Input id={`${id}-subject`} required maxLength={300} value={subject} onChange={(event) => edit(setSubject, event.target.value)} /></Field>
              <Field><FieldLabel htmlFor={`${id}-body`}>Message</FieldLabel><div className="relative"><Textarea key={previous ? `${previous.body.length}-${body.length}` : "body"} id={`${id}-body`} required maxLength={20_000} rows={12} className={cn("min-h-64 resize-y text-sm leading-relaxed transition-opacity duration-200", previous && !drafting && "cb-fade", drafting && "opacity-30")} value={body} onChange={(event) => edit(setBody, event.target.value)} autoFocus={Boolean(to)} />{drafting ? <div className="pointer-events-none absolute inset-0 grid place-content-center gap-2 justify-items-center rounded-md"><Otter pose="working-on-it" height={84} /><AITextLoading texts={["Reading their email", "Finding the right words", "Keeping it short"]} label="Naruvi is drafting your email" className="text-sm" /></div> : null}</div></Field>
              {missing.length > 0 ? <div className="grid gap-1 rounded-lg bg-muted px-3 py-2 text-xs" role="status"><p className="font-medium">Check before sending</p><ul className="list-disc space-y-1 pl-4">{missing.map((detail) => <li key={detail}>{detail}</li>)}</ul>{placeholders ? <p>Replace the bracketed details in your message.</p> : null}</div> : null}
              <fieldset className="grid gap-2 border-t pt-3"><legend className="sr-only">Attachments</legend><div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><PaperclipIcon className="size-3.5" /> Attachments</div><div className="flex flex-wrap gap-2"><Attachment label="CV" checked={attachCv} onChange={(value) => { setAttachCv(value); setDirty(true) }} available={Boolean(context.attachments.cv)} /><Attachment label="Cover letter" checked={attachLetter} onChange={(value) => { setAttachLetter(value); setDirty(true) }} available={Boolean(context.attachments.letter)} /></div></fieldset>
            </fieldset>
          </form>
          <aside className="grid min-w-0 content-start gap-5 border-t bg-muted/30 p-5 md:border-t-0 md:border-l">
            <div className="grid gap-3"><div className="flex items-center gap-2.5"><NaruviAvatar size={30} /><div className="grid"><h3 className="text-sm font-medium">Let Naruvi draft it</h3><p className="text-xs text-muted-foreground">{kind === "apply" ? "From this job and your verified facts." : "From their email. No CV recap: they’ve read it."}</p></div></div>
              {context.aiConfigured ? <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick ideas">{quickIntents(kind, context.latestEmail ? { subject: context.latestEmail.subject, text: context.latestEmail.text, kind: context.latestEmail.kind } : null).map((idea) => <button key={idea} type="button" disabled={busy} onClick={() => edit(setInstructions, idea)} className={cn("rounded-full border bg-background px-2.5 py-1 text-start text-xs transition-colors hover:border-brand/40 hover:bg-brand-soft disabled:opacity-50", instructions === idea && "border-brand/50 bg-brand-soft text-brand")}>{idea}</button>)}</div>
                <Field><FieldLabel htmlFor={`${id}-instructions`} className="text-xs">Or say it in your words</FieldLabel><Textarea id={`${id}-instructions`} rows={4} maxLength={4000} disabled={busy} className="min-h-24 text-sm" value={instructions} onChange={(event) => edit(setInstructions, event.target.value)} placeholder={kind === "reply" ? "Anything specific? Dates, a question, a detail to mention." : kind === "thank_you" ? "Add who you met and what you discussed." : "Add any details you want the email to include."} /></Field>
                <div className="grid gap-2">
                  <Segmented<"professional" | "warm" | "concise"> label="Tone" size="xs" className="w-full [&>button]:flex-1 [&>button]:justify-center" value={tone ?? "professional"} onChange={(value) => setTone(value)} options={[{ value: "professional", label: "Professional" }, { value: "warm", label: "Warm" }, { value: "concise", label: "Concise" }]} />
                  <Field><FieldLabel htmlFor={`${id}-language`} className="text-xs">Language</FieldLabel><select id={`${id}-language`} disabled={busy} value={language} onChange={(event) => setLanguage(event.target.value as DraftMailInput["language"])} className="h-9 w-full rounded-md border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"><option value="auto">Match context</option><option value="en">English</option><option value="fr">Français</option><option value="de">Deutsch</option><option value="es">Español</option><option value="ar">العربية</option></select></Field>
                </div>
                <Button type="button" disabled={busy} onClick={generate} className="bg-brand text-brand-foreground hover:bg-brand/90">{drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}{drafting ? "Writing your draft…" : previous ? "Rewrite with these notes" : "Write it for me"}</Button>
                {previous ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setSubject(previous.subject); setBody(previous.body); setMissing(previous.missing); setPrevious(null); setAiError("") }}><Undo2Icon /> Undo AI changes</Button> : null}
                {aiError ? <p role="alert" className="text-xs text-destructive">{aiError}</p> : null}
              </> : <p className="text-xs text-muted-foreground"><Link href="/settings" className="inline-flex items-center gap-1 underline underline-offset-4">Connect an AI model <ArrowUpRightIcon className="size-3" /></Link> to draft and refine emails. You can still write your own message.</p>}
            </div>
          </aside>
        </div> : <div className="grid gap-4 p-5"><Skeleton className="h-9" /><Skeleton className="h-9" /><Skeleton className="h-64" /></div>}
        {sent ? <DialogFooter className="m-0 rounded-none px-5 py-3"><Button onClick={onClose}>Done</Button></DialogFooter> : <DialogFooter className="m-0 shrink-0 items-center rounded-none px-5 py-3"><p className="me-auto text-xs text-muted-foreground" aria-live="polite">{drafting ? "Writing from your context…" : "Review your message before sending."}</p><Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" form={id} disabled={!context?.canSend || busy || !to.trim() || !subject.trim() || !body.trim() || placeholders}>{sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {sending ? "Sending…" : "Send email"}</Button></DialogFooter>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={discard} onOpenChange={setDiscard}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard this draft?</AlertDialogTitle><AlertDialogDescription>Your unsent message and drafting notes will be lost.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={onClose}>Discard draft</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>
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

/** The email being answered, above the editor, so it can be read while writing. Quotes folded away. */
function OriginalEmail({ email }: { email: { subject: string; from: string; text: string } }) {
  const [open, setOpen] = useState(true)
  const { body } = splitQuoted(email.text)
  return (
    <div className="grid gap-1.5 rounded-lg border bg-muted/40 px-3 py-2.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 items-center gap-2 text-start">
        <ReplyIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs"><span className="font-medium">{email.from}</span> <span className="text-muted-foreground">· {email.subject}</span></span>
        <ChevronDownIcon className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? <p dir="auto" className="cb-fade max-h-40 overflow-y-auto text-xs leading-5 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{body}</p> : null}
    </div>
  )
}
