"use client"

import { useState, useTransition } from "react"
import { CheckCircle2Icon, CircleAlertIcon, Loader2Icon, MailIcon, PlugZapIcon, RefreshCwIcon, ShieldCheckIcon, UnplugIcon } from "lucide-react"
import { toast } from "sonner"
import { disconnectMailAction, saveMailAction, syncMailAction, testMailAction } from "@/app/(app)/integrations/actions"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { MAIL_PROVIDERS, OTHER_PROVIDER, providerFor } from "@/lib/mail-providers"
import { OAuthSignIn } from "@/components/integrations/oauth-signin"
import { ReplyAddresses } from "@/components/integrations/reply-addresses"
import type { MailOverview } from "@/server/mail/account"

type Form = { email: string; displayName: string; provider: string; username: string; password: string; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean }

const BLANK: Form = { email: "", displayName: "", provider: "other", username: "", password: "", ...OTHER_PROVIDER.server }
const fromOverview = (overview: MailOverview): Form => (overview.connected ? { ...overview.account, password: "" } : BLANK)

function when(iso: string | null) {
  if (!iso) return "never"
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

/** Connect any mailbox over IMAP/SMTP. The password is encrypted on the server and never sent back. */
export function MailSettings({ overview, reply, oauth, origin }: { overview: MailOverview; reply: { mode: "off" | "plus" | "domain"; domain?: string }; oauth: React.ComponentProps<typeof OAuthSignIn>["clients"]; origin: string }) {
  const [editing, setEditing] = useState(!overview.connected)
  const [form, setForm] = useState<Form>(fromOverview(overview))
  const [testing, startTest] = useTransition()
  const [saving, startSave] = useTransition()
  const [syncing, startSync] = useTransition()
  const [disconnecting, startDisconnect] = useTransition()
  const provider = MAIL_PROVIDERS.find((item) => item.id === form.provider) ?? OTHER_PROVIDER
  const [showServers, setShowServers] = useState(form.provider === "other" && Boolean(form.email))
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }))

  const onEmail = (email: string) => {
    const detected = providerFor(email)
    setForm((current) => ({ ...current, email, provider: detected.id, ...(detected.id !== current.provider ? detected.server : {}) }))
    setShowServers(detected.id === "other" && email.includes("@"))
  }

  const test = () =>
    startTest(async () => {
      const result = await testMailAction(form)
      if (!result.ok) toast.error("Couldn’t connect", { description: result.message })
      else toast.success("Connection works", { description: `${result.data.messages.toLocaleString()} messages in the inbox · sending ${result.data.smtp === "ok" ? "works" : "not set up"}` })
    })
  const save = () =>
    startSave(async () => {
      const result = await saveMailAction(form)
      if (!result.ok) return void toast.error("Not connected", { description: result.message })
      toast.success("Mailbox connected", { description: "Naruvi checks it every 5 minutes. Syncing now…" })
      setEditing(false)
      setForm((current) => ({ ...current, password: "" }))
      const sync = await syncMailAction()
      if (sync.ok) toast(`Checked ${sync.data.checked} emails, ${sync.data.stored} linked to your applications`)
    })

  if (overview.connected && !editing) {
    const account = overview.account
    const error = account.status === "error"
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-4" /> Email
          </CardTitle>
          <CardDescription>Replies from companies are linked to your applications. Only matching emails are kept; the rest of your inbox is never stored.</CardDescription>
          <CardAction>
            <Badge variant={error ? "destructive" : "secondary"} className="gap-1">
              {error ? <CircleAlertIcon /> : <CheckCircle2Icon />} {error ? "Needs attention" : "Connected"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-4">
            <Item label="Mailbox" value={account.email} />
            <Item label="Provider" value={`${(MAIL_PROVIDERS.find((item) => item.id === account.provider) ?? OTHER_PROVIDER).name}${account.authType === "oauth" ? " (signed in)" : ""}`} />
            <Item label="Last checked" value={when(account.lastSyncAt)} />
            <Item label="Linked emails" value={account.matched.toLocaleString()} />
          </dl>
          {error && account.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">{account.lastError}</p> : null}
          <p className="text-xs text-muted-foreground">Reads the inbox from {new Date(account.syncFrom).toLocaleDateString(undefined, { day: "numeric", month: "long" })} on. Sending uses {account.smtpHost || "nothing yet (no SMTP server)"}.</p>
          <div className="text-muted-foreground">
            <ReplyAddresses email={account.email} initial={reply} />
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 border-t">
          <Button
            size="sm"
            disabled={syncing}
            onClick={() =>
              startSync(async () => {
                const result = await syncMailAction()
                if (!result.ok) toast.error("Sync failed", { description: result.message })
                else toast(result.data.stored ? `${result.data.stored} new email${result.data.stored === 1 ? "" : "s"} linked` : `Checked ${result.data.checked} new email${result.data.checked === 1 ? "" : "s"}; nothing about your applications`)
              })
            }
          >
            {syncing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Check now
          </Button>
          {account.authType === "oauth" ? (
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/oauth/${account.provider === "gmail" ? "google" : "microsoft"}/start?hint=${encodeURIComponent(account.email)}`} />}>
              Sign in again
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit settings
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger render={<Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" disabled={disconnecting} />}>
              <UnplugIcon /> Disconnect
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {account.email}?</AlertDialogTitle>
                <AlertDialogDescription>Naruvi forgets the password and deletes the {account.matched} linked email{account.matched === 1 ? "" : "s"} it stored. Nothing is deleted from your mailbox.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    startDisconnect(async () => {
                      const result = await disconnectMailAction()
                      if (!result.ok) toast.error(result.message)
                      else {
                        toast("Mailbox disconnected")
                        setForm(BLANK)
                        setEditing(true)
                      }
                    })
                  }
                >
                  Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="size-4" /> Email
        </CardTitle>
        <CardDescription>Connect the mailbox you apply from. Naruvi links replies to your applications and suggests what to do; it never changes anything or sends mail without your click.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <OAuthSignIn clients={oauth} origin={origin} />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or with an app password <span className="h-px flex-1 bg-border" />
        </div>
        <form
          autoComplete="off"
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="mail-email">Email address</FieldLabel>
              <Input id="mail-email" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" type="email" required value={form.email} onChange={(event) => onEmail(event.target.value)} placeholder="you@example.com" />
              {form.email.includes("@") ? <FieldDescription>{provider.name}</FieldDescription> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="mail-name">Your name (for sending)</FieldLabel>
              <Input id="mail-name" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} placeholder="Alex Morgan" />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="mail-password">App password</FieldLabel>
              <Input id="mail-password" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" type="password" value={form.password} onChange={(event) => set("password", event.target.value)} placeholder={overview.connected ? "Leave empty to keep the saved password" : "Paste the app password"} />
              <FieldDescription>{provider.help}</FieldDescription>
            </Field>
          </FieldGroup>

          <div className="grid gap-3">
            <button type="button" className="w-fit text-sm font-medium underline-offset-2 hover:underline" onClick={() => setShowServers((value) => !value)} aria-expanded={showServers}>
              {showServers ? "Hide server settings" : provider.id === "other" ? "Server settings" : `Server settings (filled in for ${provider.name})`}
            </button>
            {showServers ? (
              <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="mail-user">Username</FieldLabel>
                  <Input id="mail-user" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={form.username} onChange={(event) => set("username", event.target.value)} placeholder="Usually your email address" />
                </Field>
                <ServerFields label="Incoming (IMAP)" prefix="imap" host={form.imapHost} port={form.imapPort} secure={form.imapSecure} onHost={(value) => set("imapHost", value)} onPort={(value) => set("imapPort", value)} onSecure={(value) => set("imapSecure", value)} />
                <ServerFields label="Outgoing (SMTP)" prefix="smtp" host={form.smtpHost} port={form.smtpPort} secure={form.smtpSecure} onHost={(value) => set("smtpHost", value)} onPort={(value) => set("smtpPort", value)} onSecure={(value) => set("smtpSecure", value)} />
              </div>
            ) : null}
          </div>

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
            The password is encrypted on this computer and never shown again. Naruvi reads the inbox from 30 days ago on and keeps only emails about your applications.
          </p>
          {!overview.encryptionReady ? <p className="text-sm text-destructive">Set SETTINGS_ENCRYPTION_KEY first (run npm run settings:key), then restart Naruvi.</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || testing || !form.email || !form.imapHost}>
              {saving ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} {overview.connected ? "Save" : "Connect"}
            </Button>
            <Button type="button" variant="outline" disabled={saving || testing || !form.email || !form.imapHost} onClick={test}>
              {testing ? <Loader2Icon className="animate-spin" /> : null} Test connection
            </Button>
            {overview.connected ? (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}

function ServerFields({ label, prefix, host, port, secure, onHost, onPort, onSecure }: { label: string; prefix: string; host: string; port: number; secure: boolean; onHost: (value: string) => void; onPort: (value: number) => void; onSecure: (value: boolean) => void }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field>
          <FieldLabel htmlFor={`${prefix}-host`} className="text-xs">Server</FieldLabel>
          <Input autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" id={`${prefix}-host`} value={host} onChange={(event) => onHost(event.target.value.trim())} placeholder={`${prefix}.example.com`} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-port`} className="text-xs">Port</FieldLabel>
          <Input id={`${prefix}-port`} type="number" min={1} max={65535} value={port} onChange={(event) => onPort(Number(event.target.value))} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <Switch checked={secure} onCheckedChange={onSecure} aria-label={`${label}: SSL/TLS`} /> SSL/TLS from the start (off = STARTTLS)
      </label>
    </fieldset>
  )
}
