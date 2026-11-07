"use client"

import { useState, useTransition } from "react"
import { CalendarDaysIcon, CheckIcon, CopyIcon, DownloadIcon, Loader2Icon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"
import { calendarAction } from "@/app/(app)/integrations/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

/** A private calendar feed of next steps, for calendar apps that subscribe to a link. */
export function CalendarSettings({ token: initial, events, origin }: { token: string | null; events: number; origin: string }) {
  const [token, setToken] = useState(initial)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const url = token ? `${origin}/api/calendar/${token}.ics` : ""
  const change = (kind: "enable" | "reset" | "disable") =>
    startTransition(async () => {
      const result = await calendarAction(kind)
      if (!result.ok) return void toast.error(result.message)
      setToken(result.data.token)
      if (kind === "reset") toast("New link created", { description: "The old link stopped working. Update it in your calendar app." })
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDaysIcon className="size-4" /> Calendar
        </CardTitle>
        <CardDescription>Your dated next steps and scheduled interviews in your calendar. Reminders are all-day events; interviews keep their selected time and duration.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {token ? (
          <>
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label="Calendar link" onFocus={(event) => event.currentTarget.select()} className="font-mono text-xs" />
              <Button
                variant="outline"
                disabled={!url}
                onClick={async () => {
                  await navigator.clipboard.writeText(url)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <ul className="grid gap-1 text-muted-foreground">
              <li><span className="font-medium text-foreground">Apple Calendar:</span> File → New Calendar Subscription, paste the link.</li>
              <li><span className="font-medium text-foreground">Outlook (desktop) or Thunderbird:</span> add a calendar from the internet / on the network, paste the link.</li>
              <li><span className="font-medium text-foreground">Google Calendar:</span> it fetches links from Google’s servers, which can’t reach Naruvi on your computer. Download the file and import it instead.</li>
            </ul>
            <p className="text-xs text-muted-foreground">{events} next step{events === 1 ? "" : "s"} with a date right now. Anyone with the link can read your next steps; reset it if you shared it by mistake.</p>
          </>
        ) : (
          <p className="text-muted-foreground">Turn it on to get a private link your calendar app can subscribe to.</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        {token ? (
          <>
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/calendar/${token}.ics?download=1`} />}>
              <DownloadIcon /> Download .ics
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => change("reset")}>
              <RotateCcwIcon /> Reset link
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" disabled={pending} onClick={() => change("disable")}>
              Turn off
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => change("enable")}>
            {pending ? <Loader2Icon className="animate-spin" /> : <CalendarDaysIcon />} Turn on calendar feed
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
