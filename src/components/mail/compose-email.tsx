"use client"

import Link from "next/link"
import { useEffect, useId, useState, useTransition } from "react"
import { ChevronDownIcon, FileTextIcon, Loader2Icon, MailIcon, PaperclipIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"
import { composeContextAction, sendMailAction } from "@/app/(app)/applications/actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { COMPOSE_LABEL, type ComposeKind } from "@/lib/mail-templates"
import { cn } from "@/lib/utils"
import type { ComposeContext } from "@/server/mail/send"

/** "Email" menu on an application: pick what to write, edit the draft, send from your own mailbox. */
export function ComposeEmail({ applicationId, connected, hasReplies }: { applicationId: string; connected: boolean; hasReplies: boolean }) {
  const [kind, setKind] = useState<ComposeKind | null>(null)
  const kinds: ComposeKind[] = hasReplies ? ["reply", "follow_up", "thank_you", "apply"] : ["apply", "follow_up", "thank_you"]
  if (!connected) {
    return (
      <Button variant="outline" nativeButton={false} render={<Link href="/integrations" />} title="Connect your mailbox to send email from Naruvi">
        <MailIcon /> Email
      </Button>
    )
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          <MailIcon /> Email <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {kinds.map((item) => (
            <DropdownMenuItem key={item} onClick={() => setKind(item)}>
              {COMPOSE_LABEL[item]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {kind ? <ComposeDialog key={kind} applicationId={applicationId} kind={kind} onClose={() => setKind(null)} /> : null}
    </>
  )
}

function ComposeDialog({ applicationId, kind, onClose }: { applicationId: string; kind: ComposeKind; onClose: () => void }) {
  const [context, setContext] = useState<ComposeContext | null>(null)
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [attachCv, setAttachCv] = useState(kind === "apply")
  const [attachLetter, setAttachLetter] = useState(kind === "apply")
  const [sending, startSend] = useTransition()

  useEffect(() => {
    let current = true
    void composeContextAction(applicationId, kind).then((next) => {
      if (!current || !next) return
      setContext(next)
      setTo(next.to)
      setSubject(next.subject)
      setBody(next.body)
      setAttachCv(kind === "apply" && Boolean(next.attachments.cv))
      setAttachLetter(kind === "apply" && Boolean(next.attachments.letter))
    })
    return () => {
      current = false
    }
  }, [applicationId, kind])

  const send = () =>
    startSend(async () => {
      const result = await sendMailAction({ applicationId, kind, to, cc, subject, body, attachCv, attachLetter, replyTo: context?.replyTo ?? null })
      if (!result.ok) return void toast.error("Not sent", { description: result.message })
      const files = (attachCv ? 1 : 0) + (attachLetter ? 1 : 0)
      toast.success(files ? `Email sent with ${files} attachment${files === 1 ? "" : "s"}` : "Email sent", { description: kind === "apply" ? "The application is marked as sent, with a follow-up in a week." : "A copy is on this application and in your Sent folder." })
      onClose()
    })

  return (
    <Dialog open onOpenChange={(open) => !open && !sending && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{COMPOSE_LABEL[kind]}</DialogTitle>
          <DialogDescription>{context?.from ? `From ${context.from}. Check everything before sending; it goes out exactly as written.` : "Loading the draft…"}</DialogDescription>
        </DialogHeader>
        {context ? (
          <form
            id="compose"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
          >
            {!context.canSend ? <p className="text-sm text-destructive">Your mailbox has no outgoing (SMTP) server. Add one on the Integrations page.</p> : null}
            <FieldGroup className="gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="compose-to">To</FieldLabel>
                  <Input id="compose-to" required value={to} onChange={(event) => setTo(event.target.value)} placeholder="recruiter@company.com" autoFocus={!to} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="compose-cc">Cc</FieldLabel>
                  <Input id="compose-cc" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Optional" />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="compose-subject">Subject</FieldLabel>
                <Input id="compose-subject" required value={subject} onChange={(event) => setSubject(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="compose-body">Message</FieldLabel>
                <Textarea id="compose-body" required rows={11} value={body} onChange={(event) => setBody(event.target.value)} autoFocus={Boolean(to)} />
              </Field>
            </FieldGroup>
            <fieldset className="grid gap-2">
              <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                <PaperclipIcon className="size-3.5" /> Attach
              </legend>
              <Attachment label="CV (PDF)" checked={attachCv} onChange={setAttachCv} available={Boolean(context.attachments.cv)} />
              <Attachment label="Cover letter (PDF)" checked={attachLetter} onChange={setAttachLetter} available={Boolean(context.attachments.letter)} />
            </fieldset>
          </form>
        ) : (
          <div className="grid gap-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-48" />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" form="compose" disabled={!context?.canSend || sending || !to.trim() || !subject.trim() || !body.trim()}>
            {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Attachment({ label, checked, onChange, available }: { label: string; checked: boolean; onChange: (value: boolean) => void; available: boolean }) {
  const id = useId()
  // The label points at the checkbox instead of wrapping it, so one click toggles once.
  return (
    <div className="flex items-center gap-2 text-sm">
      <Checkbox id={id} checked={checked && available} disabled={!available} onCheckedChange={(value) => onChange(value === true)} />
      <label htmlFor={id} className={cn("flex items-center gap-2", available ? "cursor-pointer" : "text-muted-foreground")}>
        <FileTextIcon className="size-3.5 text-muted-foreground" /> {label}
      </label>
      {!available ? <span className="text-xs text-muted-foreground">not generated yet</span> : null}
    </div>
  )
}
