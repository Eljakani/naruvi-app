"use client"

import { BotIcon, CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AiAssistance } from "@/server/documents/ai-metadata"

export function AiReviewPanel({ assistance, changes, pending, onApprove }: {
  assistance?: AiAssistance
  changes: { label: string; original: string; text: string; sources?: string[] }[]
  pending: boolean
  onApprove: () => void
}) {
  if (!assistance) return null
  if (assistance.status === "unchanged") return <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">AI checked the selection and kept the original wording.</p>
  if (assistance.status === "fallback") return <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{assistance.reason ?? "AI could not improve this draft. The standard grounded version was kept."} You can edit the draft or try regenerating.</p>
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium"><BotIcon className="size-4" /> AI-assisted draft{assistance.model ? ` · ${assistance.model}` : ""}</p>
        {assistance.reviewed ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckIcon className="size-3.5" /> Reviewed</span> : null}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">AI tailored this draft using your verified facts and the posting. Check wording, scope, citations and personal motivation before approving. Automated checks cannot prove every sentence is accurate.</p>
      {changes.length ? <details className="text-xs">
        <summary className="cursor-pointer font-medium">Compare AI wording with the original ({changes.length})</summary>
        <div className="mt-3 grid gap-4">
          {changes.map((change, index) => <div key={index} className="grid gap-1.5 leading-5 [overflow-wrap:anywhere]">
            <p className="font-medium">{change.label}</p>
            <p className="text-muted-foreground"><span className="font-medium">Original:</span> {change.original}</p>
            <p><span className="font-medium">Draft:</span> {change.text}</p>
            {change.sources?.map((source) => <a key={source} href={source} target="_blank" rel="noreferrer" className="w-fit underline underline-offset-2">Company or posting source</a>)}
          </div>)}
        </div>
      </details> : null}
      {!assistance.reviewed ? <Button type="button" size="sm" variant="outline" className="w-fit" disabled={pending} onClick={onApprove}>I’ve reviewed this draft</Button> : null}
    </div>
  )
}
