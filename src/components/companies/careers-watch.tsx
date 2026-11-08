"use client"

import { useState, useTransition } from "react"
import { BellRingIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { careersAction } from "@/app/(app)/companies/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { BOARD_PROVIDERS, boardPage, type CareersBoard } from "@/lib/careers-boards"

/** Watch the company's public job board: new postings land in Jobs → Job leads. */
export function CareersWatch({ companyId, name, board, checkedAt, suggested }: { companyId: string; name: string; board: CareersBoard | null; checkedAt: Date | null; suggested: CareersBoard | null }) {
  const [url, setUrl] = useState(suggested ? boardPage(suggested) : "")
  const [pending, startTransition] = useTransition()
  const run = (value?: string | null) =>
    startTransition(async () => {
      const result = await careersAction(companyId, value)
      if (!result.ok) return void toast.error("Couldn’t update the watch", { description: result.message })
      if (value === null) return void toast.success(`Stopped watching ${name}’s job board`)
      toast.success(result.data.added ? `${result.data.added} new posting${result.data.added === 1 ? "" : "s"} in Job leads` : "No new postings right now")
    })

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><BellRingIcon className="size-4" /> {board ? `Watching ${name}’s job board` : "Watch their job board"}</CardTitle>
        <CardDescription className="text-xs">
          {board
            ? <>New postings on <a href={boardPage(board)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{BOARD_PROVIDERS[board.provider]}</a> show up in Jobs → Job leads every few hours. Ones that clearly miss your search goals are skipped.{checkedAt ? ` Last checked ${checkedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.` : ""}</>
            : `Paste their careers page (${Object.values(BOARD_PROVIDERS).join(", ")}) and new postings come to you.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {board ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => run()} disabled={pending}><RefreshCwIcon className={pending ? "animate-spin" : undefined} /> Check now</Button>
            <Button size="sm" variant="ghost" onClick={() => run(null)} disabled={pending}>Stop watching</Button>
          </div>
        ) : (
          <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); run(url) }}>
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://jobs.lever.co/company" aria-label="Careers page link" className="min-w-56 flex-1" />
            <Button size="sm" type="submit" disabled={pending || !url.trim()}>Watch</Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
