"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { AuthFeedback } from "@/components/auth/auth-feedback"
import { useTranslations } from "next-intl"

/** A terminal command with a one-click copy. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const t = useTranslations("auth")
  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* Clipboard can be blocked; the command stays selectable. */ }
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background py-1 ps-3 pe-1 font-mono text-sm">
      <span aria-hidden="true" className="select-none text-brand">$</span>
      <code className="min-w-0 flex-1 truncate select-all">{command}</code>
      <button type="button" onClick={copy} aria-label={copied ? t("copied") : t("copy", { command })}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <AuthFeedback state={copied ? "copied" : "copy"}>{copied ? <CheckIcon className="size-4 text-brand" /> : <CopyIcon className="size-4" />}</AuthFeedback>
      </button>
      <span role="status" className="sr-only">{copied ? t("commandCopied") : ""}</span>
    </div>
  )
}
