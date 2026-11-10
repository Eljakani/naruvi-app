"use client"

import { useState, useTransition } from "react"
import { CalendarDaysIcon, CheckIcon, CopyIcon, DownloadIcon, Loader2Icon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"
import { calendarAction } from "@/app/[locale]/(app)/integrations/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useTranslations } from "next-intl"

/** A private calendar feed of next steps, for calendar apps that subscribe to a link. */
export function CalendarSettings({ token: initial, events, origin }: { token: string | null; events: number; origin: string }) {
  const t = useTranslations("integrations.calendar")
  const [token, setToken] = useState(initial)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()
  const url = token ? `${origin}/api/calendar/${token}.ics` : ""
  const change = (kind: "enable" | "reset" | "disable") =>
    startTransition(async () => {
      const result = await calendarAction(kind)
      if (!result.ok) return void toast.error(result.message)
      setToken(result.data.token)
      if (kind === "reset") toast(t("newLink"), { description: t("newLinkBody") })
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDaysIcon className="size-4" /> {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {token ? (
          <>
            <div className="flex gap-2">
              <Input readOnly value={url} aria-label={t("link")} onFocus={(event) => event.currentTarget.select()} className="font-mono text-xs" />
              <Button
                variant="outline"
                disabled={!url}
                onClick={async () => {
                  await navigator.clipboard.writeText(url)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? <CheckIcon /> : <CopyIcon />} {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <ul className="grid gap-1 text-muted-foreground">
              <li><span className="font-medium text-foreground">Apple Calendar:</span> {t("apple")}</li>
              <li><span className="font-medium text-foreground">{t("outlookName")}</span> {t("outlook")}</li>
              <li><span className="font-medium text-foreground">Google Calendar:</span> {t("google")}</li>
            </ul>
            <p className="text-xs text-muted-foreground">{t("events", { count: events })}</p>
          </>
        ) : (
          <p className="text-muted-foreground">{t("off")}</p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t">
        {token ? (
          <>
            <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/api/calendar/${token}.ics?download=1`} />}>
              <DownloadIcon /> {t("download")}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => change("reset")}>
              <RotateCcwIcon /> {t("reset")}
            </Button>
            <Button size="sm" variant="ghost" className="ms-auto text-muted-foreground" disabled={pending} onClick={() => change("disable")}>
              {t("turnOff")}
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => change("enable")}>
            {pending ? <Loader2Icon className="animate-spin" /> : <CalendarDaysIcon />} {t("turnOn")}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
