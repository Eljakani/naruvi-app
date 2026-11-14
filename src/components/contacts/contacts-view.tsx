"use client"

import { OtterEmpty } from "@/components/naruvi/otter"
import { WebsiteDialog } from "@/components/companies/company-dialogs"
import { PresenceItem, PresenceList } from "@/components/presence"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition, type ReactNode } from "react"
import { ChevronRightIcon, EllipsisIcon, FileUpIcon, UserPlusIcon, Loader2Icon, MailIcon, MailSearchIcon, PencilIcon, PlusIcon, SendIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import { deleteContactAction, findEmailAction, importContactsAction, saveContactAction, startSpontaneousAction } from "@/app/[locale]/(app)/contacts/actions"
import { EntryLogo } from "@/components/profile/entry-logo"
import Link from "next/link"
import { Badge as ReBadge } from "@/components/reui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CONTACT_KINDS, contactKind, type ContactKind } from "@/lib/company-people"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput} from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { ContactListItem } from "@/server/contacts/repository"
import { useTranslations } from "next-intl"

type Editable = { id?: string; name: string; title: string; companyName: string; email: string; linkedinUrl: string; phone: string; notes: string }
const BLANK: Editable = { name: "", title: "", companyName: "", email: "", linkedinUrl: "", phone: "", notes: "" }
// Contact fields are people's details, not the user's logins: keep browser autofill out.
const NO_FILL = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-form-type": "other" } as const

const KIND_BADGE = { leader: "primary-light", tech: "info-light", recruiting: "success-light", hr: "warning-light", other: "outline" } as const

/** "Mélanie Le Barzic" → "ML": first and last word. */
const initials = (name: string) => {
  const words = name.replace(/[^\p{L}\s-]/gu, "").split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words.at(-1)![0] : "")).toUpperCase() || "?"
}

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
export function ContactsView({ contacts, finder, search }: { contacts: ContactListItem[]; finder: boolean; search?: ReactNode }) {
  const t = useTranslations("contacts")
  const [editing, setEditing] = useState<Editable | null>(null)
  const [importing, setImporting] = useState(false)
  const [spontaneous, setSpontaneous] = useState<ContactListItem | null>(null)
  const [kind, setKind] = useState<ContactKind | "all">("all")
  const kinds = new Map<ContactKind, number>()
  for (const contact of contacts) kinds.set(contactKind(contact.title), (kinds.get(contactKind(contact.title)) ?? 0) + 1)
  // One block per company, the most recently touched first; inside it, leaders first, then tech, recruiting, HR.
  const groups = [...Map.groupBy(contacts.filter((contact) => kind === "all" || contactKind(contact.title) === kind), (contact) => contact.companyId ?? (contact.company || "").toLowerCase())]
    .map(([key, list]) => ({
      key: key || "none",
      companyId: list[0].companyId,
      name: list[0].company ?? "",
      logoPath: list[0].logoPath,
      updated: Math.max(...list.map((contact) => new Date(contact.updatedAt).getTime())),
      contacts: list.toSorted((a, b) => CONTACT_KINDS.indexOf(contactKind(a.title)) - CONTACT_KINDS.indexOf(contactKind(b.title)) || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => Number(!a.name) - Number(!b.name) || b.updated - a.updated)

  return (
    <div className="grid gap-3">
      {/* Same toolbar as the other lists: search first, actions at the end. */}
      <div className="flex flex-wrap items-center gap-2">
        {search}
        <Button variant="outline" className="ms-auto" onClick={() => setImporting(true)}>
          <FileUpIcon /> {t("import")}
        </Button>
        <Button onClick={() => setEditing(BLANK)}>
          <PlusIcon /> {t("add")}
        </Button>
      </div>
      {contacts.length ? (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("kinds.label")}>
            {(["all", ...CONTACT_KINDS] as const).map((value) => {
              const count = value === "all" ? contacts.length : kinds.get(value) ?? 0
              if (value !== "all" && !count) return null
              return (
                <Button key={value} size="sm" variant={kind === value ? "secondary" : "ghost"} aria-pressed={kind === value} onClick={() => setKind(value)} className="h-7 gap-1.5">
                  {t(`kinds.${value}`)} <span className="text-muted-foreground tabular-nums">{count}</span>
                </Button>
              )
            })}
          </div>
          {groups.length ? (
            <div className="grid gap-4">
              {groups.map((group) => (
                <Card key={group.key} className="gap-0 overflow-hidden py-0">
                  <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2.5">
                    <EntryLogo path={group.logoPath} name={group.name || "?"} size={28} className="rounded-md" />
                    {group.companyId ? (
                      <Link href={`/companies/${group.companyId}`} className="min-w-0 truncate text-sm font-semibold hover:underline">{group.name}</Link>
                    ) : (
                      <span className="min-w-0 truncate text-sm font-semibold">{group.name || t("noCompany")}</span>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">{t("peopleCount", { count: group.contacts.length })}</span>
                    {group.companyId ? (
                      <Button size="sm" variant="ghost" className="ms-auto h-7 text-xs text-muted-foreground" nativeButton={false} render={<Link href={`/companies/${group.companyId}#find-people`} />}>
                        <UserPlusIcon data-icon="inline-start" /> {t("findMore")}
                      </Button>
                    ) : null}
                  </div>
                  <div className="divide-y">
                    <PresenceList>
                      {group.contacts.map((contact) => (
                        <PresenceItem key={contact.id}><ContactRow contact={contact} finder={finder} onEdit={() => setEditing({ id: contact.id, name: contact.name, title: contact.title, companyName: contact.company ?? "", email: contact.email, linkedinUrl: contact.linkedinUrl, phone: contact.phone, notes: contact.notes })} onSpontaneous={() => setSpontaneous(contact)} /></PresenceItem>
                      ))}
                    </PresenceList>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("kinds.none")}</p>
          )}
        </>
      ) : (
        <OtterEmpty
          pose="interview-practice"
          title={t("empty.title")}
          action={
            <>
              <Button onClick={() => setEditing(BLANK)}>
                <PlusIcon /> {t("add")}
              </Button>
              <Button variant="outline" onClick={() => setImporting(true)}>
                <FileUpIcon /> {t("import")}
              </Button>
            </>
          }
        >
          {t("empty.body")}
        </OtterEmpty>
      )}
      {editing ? <ContactDialog initial={editing} onClose={() => setEditing(null)} /> : null}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
      {spontaneous ? <SpontaneousDialog contact={spontaneous} onClose={() => setSpontaneous(null)} /> : null}
    </div>
  )
}

function ContactRow({ contact, finder, onEdit, onSpontaneous }: { contact: ContactListItem; finder: boolean; onEdit: () => void; onSpontaneous: () => void }) {
  const t = useTranslations("contacts")
  const [pending, startTransition] = useTransition()
  const [needsWebsite, setNeedsWebsite] = useState<string | null>(null)
  const kind = contactKind(contact.title)
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="text-xs font-medium">{initials(contact.name)}</AvatarFallback>
      </Avatar>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-start">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium hover:underline">{contact.name}</span>
          {kind !== "other" ? <ReBadge variant={KIND_BADGE[kind]} size="sm" className="shrink-0">{t(`kinds.${kind}`)}</ReBadge> : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{contact.title || t("noRole")}</span>
      </button>
      <div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground md:flex">
        {contact.email ? <span className="max-w-56 truncate" title={contact.emailSource ? t("emailFrom", { source: contact.emailSource }) : undefined}>{contact.email}</span> : <span>{t("noEmail")}</span>}
        {contact.applications ? <Badge variant="secondary">{contact.applications} application{contact.applications === 1 ? "" : "s"}</Badge> : null}
      </div>
      {contact.linkedinUrl ? (
        <Button size="icon-sm" variant="ghost" aria-label={t("onLinkedin", { name: contact.name })} nativeButton={false} render={<a href={contact.linkedinUrl} target="_blank" rel="noreferrer" />}>
          <LinkedinIcon className="size-4" />
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("actionsFor", { name: contact.name })} disabled={pending} />}>
          {pending ? <Loader2Icon className="animate-spin" /> : <EllipsisIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={onSpontaneous} disabled={!contact.company}>
            <SendIcon /> {t("spontaneous.menu")}
          </DropdownMenuItem>
          {contact.email ? (
            <DropdownMenuItem render={<a href={`mailto:${contact.email}`} />}>
              <MailIcon /> {t("mailApp")}
            </DropdownMenuItem>
          ) : null}
          {!contact.email ? (
            <DropdownMenuItem
              disabled={!finder}
              onClick={() =>
                startTransition(async () => {
                  const result = await findEmailAction(contact.id)
                  if (!result.ok && "needsWebsite" in result) setNeedsWebsite(result.needsWebsite)
                  else announceFound(result, t)
                })
              }
            >
              <MailSearchIcon /> {finder ? t("findEmail") : t("findEmailSetup")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon /> {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              // Deleting can't be reversed, so it waits out an undo window first.
              let settled = false
              const commit = () => {
                if (settled) return
                settled = true
                startTransition(async () => {
                  const result = await deleteContactAction(contact.id)
                  if (!result.ok) toast.error(t("deleteFailed", { name: contact.name }))
                })
              }
              toast(t("willDelete", { name: contact.name }), {
                duration: 5000,
                action: { label: t("undo"), onClick: () => { settled = true } },
                onAutoClose: commit,
                onDismiss: commit,
              })
            }}
          >
            <TrashIcon /> {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WebsiteDialog
        open={needsWebsite !== null}
        onOpenChange={(open) => !open && setNeedsWebsite(null)}
        companyName={needsWebsite ?? ""}
        reason={t("finderReason", { name: contact.name })}
        onSubmit={async (website) => {
          const result = await findEmailAction(contact.id, website)
          if (!result.ok && !("needsWebsite" in result)) {
            toast.error(t("found.failed"), { description: result.message })
            return false
          }
          announceFound(result, t)
          return true
        }}
      />
    </div>
  )
}

function announceFound(result: Awaited<ReturnType<typeof findEmailAction>>, t: ReturnType<typeof useTranslations<"contacts">>) {
  if (!result.ok) return void toast.error(t("found.failed"), { description: result.message })
  if (!result.data.email) return void toast(t("found.none"), { description: t("found.noneBody") })
  toast.success(t("found.title", { email: result.data.email }), { description: t("found.body", { confidence: result.data.confidence }) })
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
  const t = useTranslations("contacts")
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
          <DialogTitle>{initial.id ? t("dialog.edit") : t("dialog.add")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>
        <form
          id="contact-form"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            startTransition(async () => {
              const result = await saveContactAction(form, initial.id)
              if (!result.ok) return void toast.error(result.message)
              toast.success(initial.id ? t("dialog.saved") : t("dialog.added", { name: form.name }))
              onClose()
            })
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="contact-reach">{t("dialog.reach")}</FieldLabel>
              <InputGroup>
                <InputGroupInput id="contact-reach" autoFocus={!initial.id} value={reach} onChange={(event) => onReach(event.target.value)} onBlur={(event) => fillIn(event.target.value)} onPaste={(event) => fillIn(event.clipboardData.getData("text"))} placeholder={t("dialog.reachPlaceholder")} {...NO_FILL} />
                <InputGroupAddon>{reachKind === "linkedin" ? <LinkedinIcon className="size-4" /> : <MailIcon />}</InputGroupAddon>
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-name">{t("dialog.name")}</FieldLabel>
              <Input id="contact-name" required value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Camille Durand" {...NO_FILL} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="contact-company">{t("dialog.company")}</FieldLabel>
                <Input id="contact-company" value={form.companyName} onChange={(event) => set("companyName", event.target.value)} placeholder="Dashlane" {...NO_FILL} />
              </Field>
              <Field>
                <FieldLabel htmlFor="contact-title">{t("dialog.role")}</FieldLabel>
                <Input id="contact-title" value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Recruiter" {...NO_FILL} />
              </Field>
            </div>
            <Collapsible open={more} onOpenChange={setMore}>
              <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ms-2 text-muted-foreground" />}>
                <ChevronRightIcon className={more ? "rotate-90 transition-transform" : "transition-transform"} /> {t("dialog.more")}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <FieldGroup className="gap-4 pt-3">
                  {reachKind ? (
                    <Field>
                      <FieldLabel htmlFor="contact-other">{otherKey === "email" ? t("dialog.email") : "LinkedIn"}</FieldLabel>
                      <Input id="contact-other" type={otherKey === "email" ? "email" : "url"} value={form[otherKey]} onChange={(event) => set(otherKey, event.target.value)} placeholder={otherKey === "email" ? "camille@dashlane.com" : "https://www.linkedin.com/in/…"} {...NO_FILL} />
                    </Field>
                  ) : null}
                  <Field>
                    <FieldLabel htmlFor="contact-phone">{t("dialog.phone")}</FieldLabel>
                    <Input id="contact-phone" type="tel" value={form.phone} onChange={(event) => set("phone", event.target.value)} {...NO_FILL} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="contact-notes">{t("dialog.notes")}</FieldLabel>
                    <Textarea id="contact-notes" rows={2} value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder={t("dialog.notesPlaceholder")} />
                  </Field>
                </FieldGroup>
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button type="submit" form="contact-form" disabled={pending || !form.name.trim()}>
            {pending ? <Loader2Icon className="animate-spin" /> : null} {initial.id ? t("save") : t("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("contacts")
  const [file, setFile] = useState<File | null>(null)
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("importDialog.title")}</DialogTitle>
          <DialogDescription>{t("importDialog.description")}</DialogDescription>
        </DialogHeader>
        <button type="button" onClick={() => input.current?.click()} className="grid place-items-center gap-1 rounded-lg border border-dashed p-6 text-sm hover:bg-muted/40">
          <FileUpIcon className="size-5 text-muted-foreground" />
          <span className="font-medium">{file ? file.name : t("importDialog.choose")}</span>
          <span className="text-xs text-muted-foreground">{t("importDialog.formats")}</span>
        </button>
        <input ref={input} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button
            disabled={!file || pending}
            onClick={() =>
              startTransition(async () => {
                const form = new FormData()
                form.set("file", file!)
                const result = await importContactsAction(form)
                if (!result.ok) return void toast.error(t("importDialog.failed"), { description: result.message })
                toast.success(t("importDialog.done", { created: result.data.created, updated: result.data.updated }), { description: result.data.skipped ? t("importDialog.skipped", { count: result.data.skipped }) : undefined })
                onClose()
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} {t("import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Turn a contact's company into an application you can write CV, letter and email for. */
function SpontaneousDialog({ contact, onClose }: { contact: ContactListItem; onClose: () => void }) {
  const t = useTranslations("contacts")
  const router = useRouter()
  const [role, setRole] = useState("")
  const [language, setLanguage] = useState("en")
  const [pending, startTransition] = useTransition()
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("spontaneous.title", { company: contact.company ?? "" })}</DialogTitle>
          <DialogDescription>{t("spontaneous.description", { company: contact.company ?? "", name: contact.name })}</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="spontaneous-role">{t("spontaneous.role")}</FieldLabel>
            <Input id="spontaneous-role" value={role} onChange={(event) => setRole(event.target.value)} placeholder={t("spontaneous.rolePlaceholder")} {...NO_FILL} />
            <FieldDescription>{t("spontaneous.roleHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{t("spontaneous.language")}</FieldLabel>
            <ToggleGroup aria-label={t("spontaneous.language")} variant="outline" size="sm" value={[language]} onValueChange={(value) => value[0] && setLanguage(value[0])} className="w-fit">
              {[["en", "English"], ["fr", "Français"], ["de", "Deutsch"], ["es", "Español"]].map(([value, label]) => (
                <ToggleGroupItem key={value} value={value}>{label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>{t("cancel")}</Button>
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
            {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {t("spontaneous.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
