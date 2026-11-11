"use client"

import { useState, useTransition } from "react"
import { BellIcon, BellRingIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { disableNotificationsAction, saveNotificationsAction, testNotificationAction } from "@/app/[locale]/(app)/integrations/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { NotificationOverview } from "@/server/integrations/notify"
import { useTranslations } from "next-intl"

const randomTopic = () => `naruvi-${Array.from(crypto.getRandomValues(new Uint8Array(9)), (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 16)}`

/** Push notifications through ntfy (ntfy.sh or your own server) to your phone or desktop. */
export function NotificationSettings({ overview }: { overview: NotificationOverview }) {
  const t = useTranslations("integrations.notifications")
  const [editing, setEditing] = useState(!overview.enabled)
  const [server, setServer] = useState(overview.enabled ? overview.server : "https://ntfy.sh")
  const [topic, setTopic] = useState(overview.enabled ? overview.topic : "")
  const [token, setToken] = useState("")
  const [hidden, setHidden] = useState(overview.enabled ? overview.private : false)
  const [events, setEvents] = useState(overview.enabled ? overview.events : { replies: true, due: true, leads: true })
  const [pending, startTransition] = useTransition()

  const save = () =>
    startTransition(async () => {
      const result = await saveNotificationsAction({ server, topic: topic || randomTopic(), token, removeToken: false, private: hidden, events })
      if (!result.ok) return void toast.error(t("notSaved"), { description: result.message })
      setToken("")
      setEditing(false)
      const test = await testNotificationAction()
      if (test.ok) toast.success(t("on"), { description: t("onBody") })
      else toast.error(t("testFailedSaved"), { description: test.message })
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="size-4" /> {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {overview.enabled && !editing ? (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t("server")}</dt>
              <dd className="truncate font-medium">{overview.server.replace(/^https?:\/\//, "")}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t("topic")}</dt>
              <dd className="truncate font-mono text-xs leading-5">{overview.topic}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("about")}</dt>
              <dd className="font-medium">{[overview.events.replies && t("ev.replies"), overview.events.due && t("ev.due"), overview.events.leads && t("ev.leads")].filter(Boolean).join(", ") || t("ev.nothing")}</dd>
            </div>
          </dl>
        ) : (
          <>
            <ol className="grid list-decimal gap-1 ps-5 text-muted-foreground">
              <li>{t("step1")}</li>
              <li>{t("step2")}</li>
            </ol>
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ntfy-server">{t("server")}</FieldLabel>
                <Input id="ntfy-server" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={server} onChange={(event) => setServer(event.target.value)} placeholder="https://ntfy.sh" />
              </Field>
              <Field>
                <FieldLabel htmlFor="ntfy-topic">{t("topic")}</FieldLabel>
                <div className="flex gap-2">
                  <Input id="ntfy-topic" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={t("topicPlaceholder")} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => setTopic(randomTopic())}>
                    {t("new")}
                  </Button>
                </div>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="ntfy-token">{t("token")}</FieldLabel>
                <Input id="ntfy-token" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={overview.enabled && overview.hasToken ? t("keepToken") : t("tokenHint")} />
                <FieldDescription>{t("encrypted")}</FieldDescription>
              </Field>
            </FieldGroup>
            <div className="grid gap-2">
              <Toggle label={t("toggle.replies")} checked={events.replies} onChange={(value) => setEvents({ ...events, replies: value })} />
              <Toggle label={t("toggle.due")} checked={events.due} onChange={(value) => setEvents({ ...events, due: value })} />
              <Toggle label={t("toggle.leads")} checked={events.leads} onChange={(value) => setEvents({ ...events, leads: value })} />
              <Toggle label={t("toggle.hide")} checked={hidden} onChange={setHidden} />
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        {overview.enabled && !editing ? (
          <>
            <Button size="sm" disabled={pending} onClick={() => startTransition(async () => {
              const result = await testNotificationAction()
              if (result.ok) toast(t("testSent"))
              else toast.error(t("testFailed"), { description: result.message })
            })}>
              {pending ? <Loader2Icon className="animate-spin" /> : <BellRingIcon />} {t("sendTest")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>{t("edit")}</Button>
            <Button size="sm" variant="ghost" className="ms-auto text-muted-foreground" disabled={pending} onClick={() => startTransition(async () => {
              await disableNotificationsAction()
              setEditing(true)
              toast(t("off"))
            })}>
              {t("turnOff")}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={pending || !server} onClick={save}>
              {pending ? <Loader2Icon className="animate-spin" /> : <BellRingIcon />} {overview.enabled ? t("saveTest") : t("turnOnTest")}
            </Button>
            {overview.enabled ? <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button> : null}
          </>
        )}
      </CardFooter>
    </Card>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  )
}
