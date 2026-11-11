"use client"

import { useState, type ReactElement } from "react"
import { usePathname, useRouter } from "next/navigation"
import { JobReader, type ReadResult } from "@/components/jobs/job-reader"
import { JobReview } from "@/components/jobs/new-job-flow"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { leadParts } from "@/lib/discover"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

/**
 * "Add a job" anywhere: read a link or pasted text, then review and save it,
 * all in this dialog. A job lead opens it pre-filled (`initialUrl`/`initialText`).
 */
export function AddJobDialog({ trigger, defaultOpen = false, initialUrl = "", initialText = "", discovered = false, onClose }: { trigger?: ReactElement; defaultOpen?: boolean; initialUrl?: string; initialText?: string; /** The text came from a discovery search, not the browser extension. */ discovered?: boolean; onClose?: () => void }) {
  const t = useTranslations("jobReader")
  const tn = useTranslations("newJob")
  const [open, setOpen] = useState(defaultOpen)
  const [result, setResult] = useState<ReadResult | null>(null)
  const change = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setResult(null)
      onClose?.()
    }
  }
  const host = initialUrl ? new URL(initialUrl).hostname.replace(/^www\./, "") : ""
  return (
    <Dialog open={open} onOpenChange={change}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className={cn("gap-0 overflow-hidden p-0 transition-[max-width] duration-300 ease-out", result ? "flex h-[min(92vh,60rem)] flex-col sm:max-w-6xl" : "max-h-[92vh] overflow-y-auto sm:max-w-xl")}>
        <DialogHeader className={cn("p-4", result ? "border-b px-5 pe-12" : "pb-0")}>
          <DialogTitle>{result ? tn("reviewTitle") : t("title")}</DialogTitle>
          <DialogDescription>{result ? tn("reviewDescription") : initialText && host ? tn(discovered ? "fromDiscovery" : "fromBrowser", { host }) : t("description")}</DialogDescription>
        </DialogHeader>
        {result ? (
          <JobReview initial={result} onBack={() => setResult(null)} onSaved={() => change(false)} />
        ) : (
          <div className="p-4">
            <JobReader
              initialUrl={initialUrl}
              initialText={initialText}
              onDone={(read, source) => {
                const fromLead = source.mode === "text" && initialUrl
                // A discovered lead's text starts with the facts the search wrote; the fields hold them now.
                const rawText = fromLead && discovered ? leadParts(read.draft.rawText, true).body || read.draft.rawText : read.draft.rawText
                setResult({ ...read, draft: { ...read.draft, rawText, ...(fromLead && !read.draft.sourceUrl ? { sourceUrl: initialUrl, canonicalUrl: initialUrl } : {}) } })
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The dialog opened by a link (`/jobs?lead=…`, `?url=…`, `?add=1`); closing it drops the parameter so a reload doesn't reopen it. */
export function AddJobFromLink(props: { initialUrl?: string; initialText?: string; discovered?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  return <AddJobDialog key={`${props.initialUrl}:${props.initialText?.length ?? 0}`} defaultOpen {...props} onClose={() => router.replace(pathname, { scroll: false })} />
}
