"use client"

import { useState, useTransition } from "react"
import { BellIcon, BellRingIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { disableNotificationsAction, saveNotificationsAction, testNotificationAction } from "@/app/(app)/integrations/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { NotificationOverview } from "@/server/integrations/notify"

const randomTopic = () => `naruvi-${Array.from(crypto.getRandomValues(new Uint8Array(9)), (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 16)}`

/** Push notifications through ntfy (ntfy.sh or your own server) to your phone or desktop. */
export function NotificationSettings({ overview }: { overview: NotificationOverview }) {
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
      if (!result.ok) return void toast.error("Not saved", { description: result.message })
      setToken("")
      setEditing(false)
      const test = await testNotificationAction()
      if (test.ok) toast.success("Notifications on", { description: "A test notification is on its way." })
      else toast.error("Saved, but the test failed", { description: test.message })
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellIcon className="size-4" /> Notifications
        </CardTitle>
        <CardDescription>Get a push on your phone or desktop when a company replies, a next step is due, or new job leads arrive. Uses ntfy: free, open source, and you can run your own server.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        {overview.enabled && !editing ? (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Server</dt>
              <dd className="truncate font-medium">{overview.server.replace(/^https?:\/\//, "")}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Topic</dt>
              <dd className="truncate font-mono text-xs leading-5">{overview.topic}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">About</dt>
              <dd className="font-medium">{[overview.events.replies && "replies", overview.events.due && "due steps", overview.events.leads && "job leads"].filter(Boolean).join(", ") || "nothing"}</dd>
            </div>
          </dl>
        ) : (
          <>
            <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
              <li>Install the ntfy app on your phone (or open ntfy in a browser).</li>
              <li>Subscribe to the topic below. Anyone who knows a topic on ntfy.sh can read it, so keep the random name.</li>
            </ol>
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ntfy-server">Server</FieldLabel>
                <Input id="ntfy-server" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={server} onChange={(event) => setServer(event.target.value)} placeholder="https://ntfy.sh" />
              </Field>
              <Field>
                <FieldLabel htmlFor="ntfy-topic">Topic</FieldLabel>
                <div className="flex gap-2">
                  <Input id="ntfy-topic" autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Created for you when you save" className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => setTopic(randomTopic())}>
                    New
                  </Button>
                </div>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="ntfy-token">Access token (optional)</FieldLabel>
                <Input id="ntfy-token" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-bwignore data-form-type="other" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={overview.enabled && overview.hasToken ? "Leave empty to keep the saved token" : "Only for protected topics or your own server"} />
                <FieldDescription>Stored encrypted, like your other keys.</FieldDescription>
              </Field>
            </FieldGroup>
            <div className="grid gap-2">
              <Toggle label="New replies (interview, offer, rejection)" checked={events.replies} onChange={(value) => setEvents({ ...events, replies: value })} />
              <Toggle label="Next steps due today" checked={events.due} onChange={(value) => setEvents({ ...events, due: value })} />
              <Toggle label="New job leads from alert emails" checked={events.leads} onChange={(value) => setEvents({ ...events, leads: value })} />
              <Toggle label="Hide company names and roles in notifications" checked={hidden} onChange={setHidden} />
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        {overview.enabled && !editing ? (
          <>
            <Button size="sm" disabled={pending} onClick={() => startTransition(async () => {
              const result = await testNotificationAction()
              if (result.ok) toast("Test notification sent")
              else toast.error("Test failed", { description: result.message })
            })}>
              {pending ? <Loader2Icon className="animate-spin" /> : <BellRingIcon />} Send a test
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" disabled={pending} onClick={() => startTransition(async () => {
              await disableNotificationsAction()
              setEditing(true)
              toast("Notifications off")
            })}>
              Turn off
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={pending || !server} onClick={save}>
              {pending ? <Loader2Icon className="animate-spin" /> : <BellRingIcon />} {overview.enabled ? "Save and test" : "Turn on and test"}
            </Button>
            {overview.enabled ? <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button> : null}
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
