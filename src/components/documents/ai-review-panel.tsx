"use client"

import { CheckIcon } from "lucide-react"
import { NaruviAvatar } from "@/components/naruvi/otter"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { AiAssistance } from "@/server/documents/ai-metadata"

/** One compact banner: what AI did, and a single "reviewed" action. Details stay one click away. */
export function AiReviewPanel({ assistance, changes, pending, onApprove }: {
  assistance?: AiAssistance
  changes: { label: string; original: string; text: string; sources?: string[] }[]
  pending: boolean
  onApprove: () => void
}) {
  if (!assistance) return null
  if (assistance.status === "unchanged") return <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"><NaruviAvatar size={20} /> I checked this draft and kept your wording: it already reads well.</p>
  if (assistance.status === "fallback") return <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{assistance.reason ?? "I couldn’t improve this draft, so I kept your own wording."} You can edit it or regenerate.</p>
  return (
    <div className="grid gap-2 rounded-lg border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <NaruviAvatar size={24} />
        <p className="min-w-0 flex-1 text-sm font-medium">
          Tailored by Naruvi{changes.length ? <span className="font-normal text-muted-foreground"> · {changes.length} line{changes.length === 1 ? "" : "s"} reworded</span> : null}
        </p>
        {assistance.reviewed ? (
          <Badge variant="secondary" className="cb-pop"><CheckIcon className="text-emerald-600" /> Reviewed</Badge>
        ) : (
          <Button type="button" size="xs" variant="outline" disabled={pending} onClick={onApprove}>
            <CheckIcon /> Mark reviewed
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Have a look at the lines marked <Badge variant="outline" className="px-1 py-0 text-[11px]">AI</Badge> before you send it. You can edit or undo each one.</p>
      {changes.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">See every change side by side</summary>
          <div className="mt-2 grid gap-3">
            {changes.map((change, index) => (
              <div key={index} className="grid gap-1 leading-5 [overflow-wrap:anywhere]">
                <p className="font-medium">{change.label}</p>
                <p className="text-muted-foreground line-through decoration-muted-foreground/40">{change.original}</p>
                <p>{change.text}</p>
                {change.sources?.map((source) => <a key={source} href={source} target="_blank" rel="noreferrer" className="w-fit text-muted-foreground underline underline-offset-2">Source</a>)}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}
