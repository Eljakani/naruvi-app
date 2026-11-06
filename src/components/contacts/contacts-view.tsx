"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { ChevronRightIcon, EllipsisIcon,  FileUpIcon, Loader2Icon, MailIcon, MailSearchIcon, PencilIcon, PlusIcon, SendIcon, TrashIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"
import { deleteContactAction, findEmailAction, importContactsAction, saveContactAction, startSpontaneousAction } from "@/app/(app)/contacts/actions"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput} from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ContactListItem } from "@/server/contacts/repository"

type Editable = { id?: string; name: string; title: string; companyName: string; email: string; linkedinUrl: string; phone: string; notes: string }
const BLANK: Editable = { name: "", title: "", companyName: "", email: "", linkedinUrl: "", phone: "", notes: "" }
// Contact fields are people's details, not the user's logins: keep browser autofill out.
const NO_FILL = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-form-type": "other" } as const

function LinkedinIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}

/** People to write to: recruiters, HR, managers, referrals. */
export function ContactsView({ contacts, finder }: { contacts: ContactListItem[]; finder: boolean }) {
  const [editing, setEditing] = useState<Editable | null>(null)
  const [importing, setImporting] = useState(false)
  const [spontaneous, setSpontaneous] = useState<ContactListItem | null>(null)

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setImporting(true)}>
          <FileUpIcon /> Import
        </Button>
        <Button onClick={() => setEditing(BLANK)}>
          <PlusIcon /> Add contact
        </Button>
      </div>
      {contacts.length ? (
        <Card className="gap-0 divide-y py-0">
          {contacts.map((contact) => (
            <ContactRow key={contact.id} contact={contact} finder={finder} onEdit={() => setEditing({ id: contact.id, name: contact.name, title: contact.title, companyName: contact.company ?? "", email: contact.email, linkedinUrl: contact.linkedinUrl, phone: contact.phone, notes: contact.notes })} onSpontaneous={() => setSpontaneous(contact)} />
          ))}
        </Card>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon />
            </EmptyMedia>
            <EmptyTitle>No contacts yet</EmptyTitle>
            <EmptyDescription>Add the recruiters, HR people and managers you write to, import a spreadsheet or your LinkedIn connections, or save profiles with the browser extension.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button onClick={() => setEditing(BLANK)}>
              <PlusIcon /> Add contact
            </Button>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <FileUpIcon /> Import
            </Button>
          </EmptyContent>
        </Empty>
      )}
      {editing ? <ContactDialog initial={editing} onClose={() => setEditing(null)} /> : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
      {spontaneous ? <SpontaneousDialog contact={spontaneous} onClose={() => setSpontaneous(null)} /> : null}
    </div>
  )
}

function ContactRow({ contact, finder, onEdit, onSpontaneous }: { contact: ContactListItem; finder: boolean; onEdit: () => void; onSpontaneous: () => void }) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <EntryLogo path={contact.logoPath} name={contact.company || contact.name} size={32} />
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="block truncate font-medium hover:underline">{contact.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{[contact.title, contact.company].filter(Boolean).join(" · ") || "No role or company yet"}</span>
      </button>
      <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground md:flex">
        {contact.email ? <span className="max-w-56 truncate" title={contact.emailSource ? `From ${contact.emailSource}` : undefined}>{contact.email}</span> : <span>No email</span>}
        {contact.applications ? <Badge variant="secondary">{contact.applications} application{contact.applications === 1 ? "" : "s"}</Badge> : null}
      </div>
      {contact.linkedinUrl ? (
        <Button size="icon-sm" variant="ghost" aria-label={`${contact.name} on LinkedIn`} nativeButton={false} render={<a href={contact.linkedinUrl} target="_blank" rel="noreferrer" />}>
          <LinkedinIcon className="size-4" />
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${contact.name}`} disabled={pending} />}>
          {pending ? <Loader2Icon className="animate-spin" /> : <EllipsisIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={onSpontaneous} disabled={!contact.company}>
            <SendIcon /> Spontaneous application
          </DropdownMenuItem>
          {contact.email ? (
            <DropdownMenuItem render={<a href={`mailto:${contact.email}`} />}>
              <MailIcon /> Write in your mail app
            </DropdownMenuItem>
          ) : null}
          {!contact.email ? (
            <DropdownMenuItem
              disabled={!finder}
              onClick={() =>
                startTransition(async () => {
                  const result = await findEmailAction(contact.id)
                  if (!result.ok) toast.error("Couldn’t find an email", { description: result.message })
                  else if (!result.data.email) toast("No email found for this person")
                  else toast.success(`Found ${result.data.email}`, { description: `${result.data.confidence}% confidence. Check it before writing.` })
                })
              }
            >
              <MailSearchIcon /> {finder ? "Find email" : "Find email (set up in Integrations)"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                const result = await deleteContactAction(contact.id)
                if (result.ok) toast(`${contact.name} deleted`)
              })
            }
          >
            <TrashIcon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

const GENERIC_MAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|proton|protonmail|pm|aol|gmx|orange|free|wanadoo|laposte|sfr|web|t-online)\./i
const titleCase = (words: string) => words.split(/\s+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(" ")
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const isLinkedin = (value: string) => /linkedin\.com\/in\//i.test(value)

/** What a pasted email or LinkedIn link tells us, shown as editable suggestions (never saved unseen). */
function guessFrom(value: string): { name?: string; companyName?: string } {
  const text = value.trim()
  if (isLinkedin(text)) {
    const slug = text.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ?? ""
    const words = decodeURIComponent(slug).replace(/-[0-9a-z]*\d[0-9a-z]*$/i, "").replace(/[-_]+/g, " ")
    return words.trim().includes(" ") ? { name: titleCase(words) } : {}
  }
  if (isEmail(text)) {
    const [local, domain] = text.toLowerCase().split("@")
    const parts = local.split(/[._-]+/).filter((part) => /^[a-z]{2,}$/.test(part))
    const company = GENERIC_MAIL.test(domain) ? undefined : titleCase(domain.split(".").slice(-2, -1)[0] ?? "")
    return { name: parts.length >= 2 ? titleCase(parts.slice(0, 2).join(" ")) : undefined, companyName: company || undefined }
  }
  return {}
}

function ContactDialog({ initial, onClose }: { initial: Editable; onClose: () => void }) {
  const [form, setForm] = useState(initial)
  // One field for the main way to reach them; the other one, phone and notes wait under "More".
  const [reach, setReach] = useState(initial.email || initial.linkedinUrl)
  const [more, setMore] = useState(Boolean(initial.phone || initial.notes || (initial.email && initial.linkedinUrl)))
  const [pending, startTransition] = useTransition()
  const set = (key: keyof Editable, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const reachKind = isLinkedin(reach) ? "linkedin" : isEmail(reach) ? "email" : reach.includes("@") ? "email" : null
  const onReach = (value: string) => {
    setReach(value)
    setForm((current) => ({
      ...current,
      ...(isLinkedin(value) ? { linkedinUrl: value.trim(), email: current.email === reach.trim() ? "" : current.email } : { email: value.trim(), linkedinUrl: current.linkedinUrl === reach.trim() ? "" : current.linkedinUrl }),
    }))
  }
  // Fill empty fields once the address is complete (on leaving the field or pasting), not mid-typing.
  const fillIn = (value: string) => {
    const guess = guessFrom(value)
    setForm((current) => ({ ...current, name: current.name || guess.name || "", companyName: current.companyName || guess.companyName || "" }))
  }
  const otherKey = reachKind === "linkedin" ? "email" : "linkedinUrl"
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit contact" : "Add a contact"}</DialogTitle>
          <DialogDescription>Only a name is needed. Paste an email or LinkedIn link and Naruvi fills in what it can.</DialogDescription>
        </DialogHeader>
        <form
          id="contact-form"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            startTransition(async () => {
              const result = await saveContactAction(form, initial.id)
              if (!result.ok) return void toast.error(result.message)
              toast.success(initial.id ? "Contact saved" : `${form.name} added`)
              onClose()
            })
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="contact-reach">Email or LinkedIn</FieldLabel>
              <InputGroup>
                <InputGroupInput id="contact-reach" autoFocus={!initial.id} value={reach} onChange={(event) => onReach(event.target.value)} onBlur={(event) => fillIn(event.target.value)} onPaste={(event) => fillIn(event.clipboardData.getData("text"))} placeholder="camille@dashlane.com or linkedin.com/in/…" {...NO_FILL} />
                <InputGroupAddon>{reachKind === "linkedin" ? <LinkedinIcon className="size-4" /> : <MailIcon />}</InputGroupAddon>
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-name">Name</FieldLabel>
              <Input id="contact-name" required value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Camille Durand" {...NO_FILL} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="contact-company">Company</FieldLabel>
                <Input id="contact-company" value={form.companyName} onChange={(event) => set("companyName", event.target.value)} placeholder="Dashlane" {...NO_FILL} />
              </Field>
              <Field>
                <FieldLabel htmlFor="contact-title">Role</FieldLabel>
                <Input id="contact-title" value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Recruiter" {...NO_FILL} />
              </Field>
            </div>
            <Collapsible open={more} onOpenChange={setMore}>
              <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" />}>
                <ChevronRightIcon className={more ? "rotate-90 transition-transform" : "transition-transform"} /> More details
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FieldGroup className="gap-4 pt-3">
                  {reachKind ? (
                    <Field>
                      <FieldLabel htmlFor="contact-other">{otherKey === "email" ? "Email" : "LinkedIn"}</FieldLabel>
                      <Input id="contact-other" type={otherKey === "email" ? "email" : "url"} value={form[otherKey]} onChange={(event) => set(otherKey, event.target.value)} placeholder={otherKey === "email" ? "camille@dashlane.com" : "https://www.linkedin.com/in/…"} {...NO_FILL} />
                    </Field>
                  ) : null}
                  <Field>
                    <FieldLabel htmlFor="contact-phone">Phone</FieldLabel>
                    <Input id="contact-phone" type="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} {...NO_FILL} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="contact-notes">Notes</FieldLabel>
                    <Textarea id="contact-notes" rows={2} value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Met at DevFest, introduced by Léa…" />
                  </Field>
                </FieldGroup>
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="contact-form" disabled={pending || !form.name.trim()}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} {initial.id ? "Save" : "Add contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>An Excel or CSV file with a name column, or your LinkedIn connections (LinkedIn → Settings → Data privacy → Get a copy of your data → Connections). Columns are matched automatically; people already here are updated, not duplicated.</DialogDescription>
        </DialogHeader>
        <button type="button" onClick={() => input.current?.click()} className="grid place-items-center gap-1 rounded-lg border border-dashed p-6 text-sm hover:bg-muted/40">
          <FileUpIcon className="size-5 text-muted-foreground" />
          <span className="font-medium">{file ? file.name : "Choose a file"}</span>
          <span className="text-xs text-muted-foreground">.xlsx or .csv, up to 10 MB</span>
        </button>
        <input ref={input} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!file || pending}
            onClick={() =>
              startTransition(async () => {
                const form = new FormData()
                form.set("file", file!)
                const result = await importContactsAction(form)
                if (!result.ok) return void toast.error("Import failed", { description: result.message })
                toast.success(`${result.data.created} added, ${result.data.updated} updated`, { description: result.data.skipped ? `${result.data.skipped} rows skipped (no name or duplicates).` : undefined })
                onClose()
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Turn a contact's company into an application you can write CV, letter and email for. */
function SpontaneousDialog({ contact, onClose }: { contact: ContactListItem; onClose: () => void }) {
  const router = useRouter()
  const [role, setRole] = useState("")
  const [language, setLanguage] = useState("en")
  const [pending, startTransition] = useTransition()
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Spontaneous application to {contact.company}</DialogTitle>
          <DialogDescription>No posting needed. Naruvi creates an application for {contact.company} with {contact.name} as the person you write to; then draft your CV and letter, and send them by email or note that you reached out on LinkedIn.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="spontaneous-role">Role you’re aiming for</FieldLabel>
            <Input id="spontaneous-role" value={role} onChange={(event) => setRole(event.target.value)} placeholder="Optional, e.g. DevOps engineer" {...NO_FILL} />
            <FieldDescription>Leave empty for an open application.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Language</FieldLabel>
            <ToggleGroup aria-label="Language" variant="outline" size="sm" value={[language]} onValueChange={(value) => value[0] && setLanguage(value[0])} className="w-fit">
              {[["en", "English"], ["fr", "Français"], ["de", "Deutsch"], ["es", "Español"]].map(([value, label]) => (
                <ToggleGroupItem key={value} value={value}>{label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await startSpontaneousAction({ companyName: contact.company ?? "", role: role || undefined, contactId: contact.id, language })
                if (!result.ok) return void toast.error(result.message)
                router.push(`/applications/${result.data.applicationId}`)
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Create application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
