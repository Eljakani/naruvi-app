"use client"

import { useState, useTransition } from "react"
import { BellRingIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { careersAction } from "@/app/[locale]/(app)/companies/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { BOARD_PROVIDERS, boardPage, type CareersBoard } from "@/lib/careers-boards"
import { useLocale, useTranslations } from "next-intl"

/** Watch the company's public job board: new postings land in Jobs → Job leads. */
export function CareersWatch({ companyId, name, board, checkedAt, suggested }: { companyId: string; name: string; board: CareersBoard | null; checkedAt: Date | null; suggested: CareersBoard | null }) {
  const [url, setUrl] = useState(suggested ? boardPage(suggested) : "")
  const [pending, startTransition] = useTransition()
  const t = useTranslations("careersWatch")
  const locale = useLocale()
  const run = (value?: string | null) =>
    startTransition(async () => {
      const result = await careersAction(companyId, value)
      if (!result.ok) return void toast.error(t("updateFailed"), { description: result.message })
      if (value === null) return void toast.success(t("stopped", { name }))
      toast.success(result.data.added ? t("added", { count: result.data.added }) : t("noneNew"))
    })

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><BellRingIcon className="size-4" /> {board ? t("watching", { name }) : t("watch")}</CardTitle>
        <CardDescription className="text-xs">
          {board
            ? <>{t.rich("watchingBody", { provider: BOARD_PROVIDERS[board.provider], link: (chunks) => <a href={boardPage(board)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{chunks}</a> })}{checkedAt ? ` ${t("lastChecked", { date: checkedAt.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) })}` : ""}</>
            : t("pasteHint", { providers: Object.values(BOARD_PROVIDERS).join(", ") })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {board ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => run()} disabled={pending}><RefreshCwIcon className={pending ? "animate-spin" : undefined} /> {t("checkNow")}</Button>
            <Button size="sm" variant="ghost" onClick={() => run(null)} disabled={pending}>{t("stop")}</Button>
          </div>
        ) : (
          <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); run(url) }}>
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://jobs.lever.co/company" aria-label={t("linkLabel")} className="min-w-56 flex-1" />
            <Button size="sm" type="submit" disabled={pending || !url.trim()}>{t("watchButton")}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
