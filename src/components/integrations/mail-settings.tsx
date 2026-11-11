"use client"

import UndoButton from "@/components/kokonutui/undo-button"
import { useState, useTransition } from "react"
import { CheckCircle2Icon, ChevronDownIcon, CircleAlertIcon, KeyRoundIcon, Loader2Icon, MailIcon, PlugZapIcon, RefreshCwIcon, ServerIcon, ShieldCheckIcon, UnplugIcon } from "lucide-react"
import { toast } from "sonner"
import { disconnectMailAction, saveMailAction, saveResendAction, startResendOAuthAction, syncMailAction, testMailAction } from "@/app/[locale]/(app)/integrations/actions"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProviderLogo } from "@/components/brand-logos"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { MAIL_PROVIDERS, OTHER_PROVIDER, providerFor } from "@/lib/mail-providers"
import { OAuthSignIn } from "@/components/integrations/oauth-signin"
import { ReplyAddresses } from "@/components/integrations/reply-addresses"
import type { MailOverview } from "@/server/mail/account"
import { useLocale, useNow, useTranslations } from "next-intl"

type Form = { email: string; displayName: string; provider: string; username: string; password: string; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean }

const BLANK: Form = { email: "", displayName: "", provider: "other", username: "", password: "", ...OTHER_PROVIDER.server }
const fromOverview = (overview: MailOverview): Form => (overview.connected ? { ...overview.account, password: "" } : BLANK)


/** Connect any mailbox over IMAP/SMTP. The password is encrypted on the server and never sent back. */
export function MailSettings({ overview, reply, oauth, origin }: { overview: MailOverview; reply: { mode: "off" | "plus" | "domain"; domain?: string }; oauth: React.ComponentProps<typeof OAuthSignIn>["clients"]; origin: string }) {
  const locale = useLocale()
  const now = useNow({ updateInterval: 60_000 })
  const when = (iso: string | null) => {
    if (!iso) return t("never")
    const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
    return minutes < 1 ? t("justNow") : minutes < 60 ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-minutes, "minute") : new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
  }
  const t = useTranslations("integrations.mail")
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
      if (!result.ok) toast.error(t("cantConnect"), { description: result.message })
      else toast.success(t("works"), { description: t("worksBody", { count: result.data.messages, sending: result.data.smtp === "ok" ? "ok" : "no" }) })
    })
  const save = () =>
    startSave(async () => {
      const result = await saveMailAction(form)
      if (!result.ok) return void toast.error(t("notConnected"), { description: result.message })
      toast.success(t("connected"), { description: t("connectedBody") })
      setEditing(false)
      setForm((current) => ({ ...current, password: "" }))
      const sync = await syncMailAction()
      if (sync.ok) toast(t("synced", { checked: sync.data.checked, stored: sync.data.stored }))
    })

  if (overview.connected && !editing) {
    const account = overview.account
    const error = account.status === "error"
    const resend = account.provider === "resend"
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailIcon className="size-4" /> {t("title")}
          </CardTitle>
          <CardDescription>{t("connectedDescription")}</CardDescription>
          <CardAction>
            <Badge variant={error ? "destructive" : "secondary"} className="gap-1">
              {error ? <CircleAlertIcon /> : <CheckCircle2Icon />} {error ? t("needsAttention") : t("badgeConnected")}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-4">
            <div className="flex min-w-0 items-center gap-2 sm:col-span-1"><ProviderLogo id={account.provider} className="size-5 shrink-0" /><Item label={t("mailbox")} value={account.email} /></div>
            <Item label={t("provider")} value={resend ? (account.authType === "resend_oauth" ? t("signedIn", { name: "Resend" }) : "Resend") : account.authType === "oauth" ? t("signedIn", { name: (MAIL_PROVIDERS.find((item) => item.id === account.provider) ?? OTHER_PROVIDER).name }) : account.provider === "other" ? t("otherProvider") : (MAIL_PROVIDERS.find((item) => item.id === account.provider) ?? OTHER_PROVIDER).name} />
            <Item label={t("lastChecked")} value={when(account.lastSyncAt)} />
            <Item label={t("linked")} value={account.matched.toLocaleString(locale)} />
          </dl>
          {error && account.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">{account.lastError}</p> : null}
          {resend ? (
            <p className="text-xs text-muted-foreground">{t("resendInfo", { domain: account.username.split("@")[1] ?? "" })}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("readsFrom", { date: new Date(account.syncFrom).toLocaleDateString(locale, { day: "numeric", month: "long" }), smtp: account.smtpHost || t("noSmtp") })}</p>
              <div className="text-muted-foreground">
                <ReplyAddresses email={account.email} initial={reply} />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 border-t">
          <Button
            size="sm"
            disabled={syncing}
            onClick={() =>
              startSync(async () => {
                const result = await syncMailAction()
                if (!result.ok) toast.error(t("syncFailed"), { description: result.message })
                else toast(result.data.stored ? t("newLinked", { count: result.data.stored }) : t("noMatches", { count: result.data.checked }))
              })
            }
          >
            {syncing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {t("checkNow")}
          </Button>
          {account.authType === "oauth" ? (
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/oauth/${account.provider === "gmail" ? "google" : "microsoft"}/start?hint=${encodeURIComponent(account.email)}`} />}>
              {t("signInAgain")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              {t("editSettings")}
            </Button>
          )}
          {account.authType === "oauth" ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{t("changeProvider")}</Button> : null}
          <AlertDialog>
            <AlertDialogTrigger render={<Button size="sm" variant="ghost" className="ms-auto text-muted-foreground" disabled={disconnecting} />}>
              <UnplugIcon /> {t("disconnect")}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("disconnectTitle", { email: account.email })}</AlertDialogTitle>
                <AlertDialogDescription>{t("disconnectBody", { count: account.matched })}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <UndoButton
                  label={t("disconnect")}
                  doneLabel={t("disconnected")}
                  icon={UnplugIcon}
                  className="h-8 text-destructive"
                  resetAfter={null}
                  disabled={disconnecting}
                  onCommit={() =>
                    startDisconnect(async () => {
                      const result = await disconnectMailAction()
                      if (!result.ok) toast.error(result.message)
                      else {
                        toast(t("disconnectedToast"))
                        setForm(BLANK)
                        setEditing(true)
                      }
                    })
                  }
                />
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
          <MailIcon className="size-4" /> {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={overview.connected && overview.account.provider === "resend" ? "resend" : overview.connected ? "password" : "signin"}>
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="signin">{t("tabs.signin")}</TabsTrigger>
            <TabsTrigger value="password">{t("tabs.password")}</TabsTrigger>
            <TabsTrigger value="resend">Resend</TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="pt-3">
            <OAuthSignIn clients={oauth} origin={origin} />
          </TabsContent>
          <TabsContent value="resend" className="pt-4">
            <ResendForm overview={overview} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
          </TabsContent>
          <TabsContent value="password" className="pt-3">
            <form
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault()
                save()
              }}
            >
              <FieldGroup className="gap-5">
                <FieldSet>
                  <FieldLegend variant="label">{t("yourMailbox")}</FieldLegend>
                  <FieldDescription>{t("worksWith")}</FieldDescription>
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="mail-email">{t("emailAddress")}</FieldLabel>
                      <InputGroup>
                        <InputGroupInput id="mail-email" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" type="email" required value={form.email} onChange={(event) => onEmail(event.target.value)} placeholder="you@example.com" />
                        <InputGroupAddon>
                          <ProviderLogo id={form.email.includes("@") ? provider.id : ""} className="size-4" />
                        </InputGroupAddon>
                      </InputGroup>
                      {form.email.includes("@") ? <FieldDescription>{provider.id === "other" ? t("otherProvider") : provider.name}</FieldDescription> : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="mail-name">{t("yourName")} <span className="font-normal text-muted-foreground">{t("shownWhenSend")}</span></FieldLabel>
                      <Input id="mail-name" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} placeholder="Alex Morgan" />
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="mail-password">{t("tabs.password")}</FieldLabel>
                      <InputGroup>
                        <InputGroupInput id="mail-password" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" type="password" value={form.password} onChange={(event) => set("password", event.target.value)} placeholder={overview.connected ? t("keepPassword") : t("pastePassword")} />
                        <InputGroupAddon>
                          <KeyRoundIcon />
                        </InputGroupAddon>
                      </InputGroup>
                      <FieldDescription>{t(`help.${provider.id}` as never)}</FieldDescription>
                    </Field>
                  </FieldGroup>
                </FieldSet>

                <Collapsible open={showServers} onOpenChange={setShowServers} className="rounded-lg border">
                  <CollapsibleTrigger render={<button type="button" />} className="group/servers flex w-full items-center gap-2 px-4 py-3 text-start text-sm font-medium">
                    <ServerIcon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{t("serverSettings")}</span>
                    <span className="text-xs font-normal text-muted-foreground">{provider.id === "other" ? t("needed") : t("filledFor", { name: provider.name })}</span>
                    <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-aria-expanded/servers:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                      <Field className="sm:col-span-2">
                        <FieldLabel htmlFor="mail-user">{t("username")}</FieldLabel>
                        <Input id="mail-user" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={form.username} onChange={(event) => set("username", event.target.value)} placeholder={t("usernamePlaceholder")} />
                      </Field>
                      <ServerFields label={t("incoming")} prefix="imap" host={form.imapHost} port={form.imapPort} secure={form.imapSecure} onHost={(value) => set("imapHost", value)} onPort={(value) => set("imapPort", value)} onSecure={(value) => set("imapSecure", value)} />
                      <ServerFields label={t("outgoing")} prefix="smtp" host={form.smtpHost} port={form.smtpPort} secure={form.smtpSecure} onHost={(value) => set("smtpHost", value)} onPort={(value) => set("smtpPort", value)} onSecure={(value) => set("smtpSecure", value)} />
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                {!overview.encryptionReady ? (
                  <Alert variant="destructive">
                    <CircleAlertIcon />
                    <AlertTitle>{t("noStorage")}</AlertTitle>
                    <AlertDescription>{t.rich("runKey", { code: (chunks) => <code>{chunks}</code> })}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                  <Button type="submit" disabled={saving || testing || !form.email || !form.imapHost}>
                    {saving ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} {overview.connected ? t("save") : t("connect")}
                  </Button>
                  <Button type="button" variant="outline" disabled={saving || testing || !form.email || !form.imapHost} onClick={test}>
                    {testing ? <Loader2Icon className="animate-spin" /> : null} {t("test")}
                  </Button>
                  {overview.connected ? (
                    <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                      {t("cancel")}
                    </Button>
                  ) : null}
                  <p className="flex basis-full items-start gap-2 text-xs text-muted-foreground sm:ms-auto sm:basis-auto sm:max-w-80">
                    <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
                    {t("encrypted")}
                  </p>
                </div>
              </FieldGroup>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function ResendForm({ overview, onSaved, onCancel }: { overview: MailOverview; onSaved: () => void; onCancel: () => void }) {
  const t = useTranslations("integrations.mail")
  const existing = overview.connected && overview.account.provider === "resend" ? overview.account : null
  const [email, setEmail] = useState(existing?.email ?? "")
  const [displayName, setDisplayName] = useState(existing?.displayName ?? "")
  const [inboundEmail, setInboundEmail] = useState(existing?.username ?? "")
  const [apiKey, setApiKey] = useState("")
  const [useApiKey, setUseApiKey] = useState(false)
  const hasSavedKey = existing?.authType === "api"
  const [saving, startSave] = useTransition()

  return (
    <form autoComplete="off" onSubmit={(event) => {
      event.preventDefault()
      startSave(async () => {
        if (!useApiKey) {
          const result = await startResendOAuthAction({ email, displayName, inboundEmail })
          if (!result.ok) return void toast.error(t("resend.startFailed"), { description: result.message })
          window.location.assign(result.data.url)
          return
        }
        const result = await saveResendAction({ email, displayName, inboundEmail, apiKey })
        if (!result.ok) return void toast.error(t("resend.failed"), { description: result.message })
        setApiKey("")
        onSaved()
        toast.success(t("resend.connected"))
      })
    }}>
      <FieldGroup className="gap-4">
        <FieldDescription>{t("resend.intro")}</FieldDescription>
        {overview.connected && !existing ? <FieldDescription>{t("resend.switch")}</FieldDescription> : null}
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="resend-email">{t("resend.sender")}</FieldLabel>
            <Input id="resend-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="resend-name">{t("resend.senderName")} <span className="font-normal text-muted-foreground">{t("optional")}</span></FieldLabel>
            <Input id="resend-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="resend-inbox">{t("resend.inbox")}</FieldLabel>
            <Input id="resend-inbox" type="email" required value={inboundEmail} onChange={(event) => setInboundEmail(event.target.value)} />
          </Field>
          {useApiKey ? (
            <Field>
              <FieldLabel htmlFor="resend-key">{t("resend.key")}</FieldLabel>
              <Input id="resend-key" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" required={!hasSavedKey} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={hasSavedKey ? t("resend.keepKey") : undefined} />
              <FieldDescription>{t("resend.keyHint")}</FieldDescription>
            </Field>
          ) : null}
        </FieldGroup>
        {!useApiKey ? <FieldDescription>{t("resend.fullAccess")}</FieldDescription> : null}
        {!overview.encryptionReady ? <FieldDescription>{t.rich("resend.runKey", { code: (chunks) => <code>{chunks}</code> })}</FieldDescription> : null}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button type="submit" disabled={saving || !overview.encryptionReady}>
            {saving ? <Loader2Icon className="animate-spin" /> : <PlugZapIcon />} {useApiKey ? t("resend.saveKey") : t("resend.continue")}
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setUseApiKey(!useApiKey)}>
            {useApiKey ? t("resend.useSignin") : t("resend.useKey")}
          </Button>
          {overview.connected ? <Button type="button" variant="ghost" onClick={onCancel}>{t("cancel")}</Button> : null}
        </div>
      </FieldGroup>
    </form>
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
  const t = useTranslations("integrations.mail")
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field>
          <FieldLabel htmlFor={`${prefix}-host`} className="text-xs">{t("server")}</FieldLabel>
          <Input autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" id={`${prefix}-host`} value={host} onChange={(event) => onHost(event.target.value.trim())} placeholder={`${prefix}.example.com`} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-port`} className="text-xs">{t("port")}</FieldLabel>
          <Input id={`${prefix}-port`} type="number" min={1} max={65535} value={port} onChange={(event) => onPort(Number(event.target.value))} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <Switch checked={secure} onCheckedChange={onSecure} aria-label={`${label}: SSL/TLS`} /> {t("ssl")}
      </label>
    </fieldset>
  )
}
