"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { CheckCircle2Icon, Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { saveApifyAction } from "@/app/[locale]/(app)/jobs/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { DISCOVER_BOARDS, type DiscoverBoard } from "@/lib/discover"
import type { ApifyStatus } from "@/server/jobs/discover"
import { useLocale, useTranslations } from "next-intl"

/** Discover postings that match the profile on job boards (Apify, your own token). */
export function ApifySettings({ status }: { status: ApifyStatus }) {
  const t = useTranslations("integrations.apify")
  const locale = useLocale()
  const [token, setToken] = useState("")
  const [boards, setBoards] = useState<DiscoverBoard[]>(status.boards)
  const [daily, setDaily] = useState(status.daily)
  const [pending, startTransition] = useTransition()
  const searches = status.searches
  const run = (value: Parameters<typeof saveApifyAction>[0]) =>
    startTransition(async () => {
      const result = await saveApifyAction(value)
      if (!result.ok) return void toast.error(result.message)
      setToken("")
      toast(value ? t("ready") : t("removed"))
    })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4" /> {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        {status.configured ? (
          <CardAction>
            <Badge variant="secondary" className="gap-1"><CheckCircle2Icon /> {t("badge")}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm">
        <form
          className="grid gap-4"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault()
            run({ token, boards, daily })
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="apify-token">{t("key")}</Label>
            <Input id="apify-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder={status.configured ? t("replaceKey") : ""} autoComplete="new-password" data-1p-ignore data-lpignore="true" data-form-type="other" />
          </div>
          <div className="grid gap-1.5">
            <p className="font-medium">{t("plan")}</p>
            <p className="text-xs text-muted-foreground">{t("planHelp")}</p>
            {searches.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {searches.map((search) => (
                  <li key={search}><Badge variant="outline" className="font-normal">{search}</Badge></li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{t("planEmpty")} <Link href="/profile#search-goals" className="underline underline-offset-2">{t("planEmptyLink")}</Link></p>
            )}
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">{t("boards")}</legend>
            <div className="flex flex-wrap gap-4">
              {(Object.keys(DISCOVER_BOARDS) as DiscoverBoard[]).map((board) => (
                <Label key={board} className="font-normal">
                  <Checkbox checked={boards.includes(board)} onCheckedChange={(on) => setBoards(on ? [...boards, board] : boards.filter((item) => item !== board))} /> {DISCOVER_BOARDS[board]}
                </Label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center gap-2">
            <Switch id="apify-daily" checked={daily} onCheckedChange={setDaily} />
            <Label htmlFor="apify-daily" className="font-normal">{t("daily")}</Label>
            {status.lastRunAt ? <span className="ms-auto text-xs text-muted-foreground">{t("lastRun", { when: new Date(status.lastRunAt).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</span> : null}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || (!status.configured && !token.trim()) || !boards.length}>
              {pending ? <Loader2Icon className="animate-spin" /> : null} {t("save")}
            </Button>
            {status.configured ? <Button type="button" variant="ghost" disabled={pending} onClick={() => run(null)}>{t("remove")}</Button> : null}
          </div>
          <p className="text-xs text-muted-foreground">{t("privacy")}</p>
        </form>
      </CardContent>
    </Card>
  )
}
