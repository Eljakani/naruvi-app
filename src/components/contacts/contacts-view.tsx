"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { EllipsisIcon, FileUpIcon, Loader2Icon, MailIcon, MailSearchIcon, PencilIcon, PlusIcon, SendIcon, TrashIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"
import { deleteContactAction, findEmailAction, importContactsAction, saveContactAction, startSpontaneousAction } from "@/app/(app)/contacts/actions"
import { EntryLogo } from "@/components/profile/entry-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
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

function ContactDialog({ initial, onClose }: { initial: Editable; onClose: () => void }) {
  const [form, setForm] = useState(initial)
  const [pending, startTransition] = useTransition()
  const set = (key: keyof Editable, value: string) => setForm((current) => ({ ...current, [key]: value }))
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit contact" : "Add a contact"}</DialogTitle>
          <DialogDescription>A recruiter, an HR person, a hiring manager or someone who can refer you.</DialogDescription>
        </DialogHeader>
        <form
          id="contact-form"
          autoComplete="off"
          className="grid gap-3"
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
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="contact-name">Name</FieldLabel>
              <Input id="contact-name" required value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Camille Durand" {...NO_FILL} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-title">Role</FieldLabel>
              <Input id="contact-title" value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Talent acquisition" {...NO_FILL} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-company">Company</FieldLabel>
              <Input id="contact-company" value={form.companyName} onChange={(event) => set("companyName", event.target.value)} placeholder="Dashlane" {...NO_FILL} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-email">Email</FieldLabel>
              <Input id="contact-email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} placeholder="Optional" {...NO_FILL} />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-phone">Phone</FieldLabel>
              <Input id="contact-phone" value={form.phone} onChange={(event) => set("phone", event.target.value)} placeholder="Optional" {...NO_FILL} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="contact-linkedin">LinkedIn</FieldLabel>
              <Input id="contact-linkedin" value={form.linkedinUrl} onChange={(event) => set("linkedinUrl", event.target.value)} placeholder="https://www.linkedin.com/in/…" {...NO_FILL} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="contact-notes">Notes</FieldLabel>
              <Textarea id="contact-notes" rows={3} value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Met at DevFest, introduced by Léa…" />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="contact-form" disabled={pending || !form.name.trim()}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} Save
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
