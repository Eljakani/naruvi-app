"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { SparklesIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { applicationSyncAction } from "@/app/[locale]/(app)/applications/actions"
import type { FitPhase } from "@/server/applications/repository"
import { cn } from "@/lib/utils"

type Pending = { fit: boolean; insights: boolean }

const PHASES: FitPhase[] = ["reading", "profile", "matching", "scoring"]
/** A check takes a second or two, a minute with a slow model; give up watching after ~4 minutes. */
const INTERVAL_MS = 1200
const MAX_TRIES = 200

/**
 * Watches what the application page is waiting for (the fit check, the job's
 * insights) with a small status call, and reloads the page only when one of
 * them lands. Returns the phase the check is in.
 */
function useApplicationSync(applicationId: string, waiting: Pending, initialPhase: FitPhase | null) {
  const router = useRouter()
  const [phase, setPhase] = useState<FitPhase | null>(initialPhase)
  const pending = useRef(waiting)
  useEffect(() => {
    pending.current = waiting
    if (!waiting.fit && !waiting.insights) return
    let tries = 0
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      tries += 1
      const status = document.hidden ? undefined : await applicationSyncAction(applicationId).catch(() => undefined)
      if (stopped) return
      if (status) {
        if (status.phase) setPhase(status.phase)
        const next = { fit: status.fit === "running", insights: !status.insights }
        const landed = (pending.current.fit && !next.fit) || (pending.current.insights && !next.insights)
        pending.current = next
        if (landed) router.refresh()
        if (!next.fit && !next.insights) return
      }
      // `null`: the application is gone. Otherwise keep watching, more slowly once it's clearly a long one.
      if (status === null || tries > MAX_TRIES) return
      timer = setTimeout(tick, tries > 30 ? INTERVAL_MS * 3 : INTERVAL_MS)
    }
    timer = setTimeout(tick, INTERVAL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [applicationId, waiting.fit, waiting.insights, router]) // eslint-disable-line react-hooks/exhaustive-deps
  return phase
}

/** The fit check running in the background: which step it is on, live. The result opens by itself. */
export function FitChecking({ applicationId, phase: initial, insightsPending = false, className }: { applicationId: string; phase: FitPhase; insightsPending?: boolean; className?: string }) {
  const t = useTranslations("application")
  const phase = useApplicationSync(applicationId, { fit: true, insights: insightsPending }, initial) ?? initial
  const at = PHASES.indexOf(phase)
  return (
    <div role="status" aria-live="polite" className={cn("grid min-w-44 gap-1.5", className)}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <SparklesIcon className="size-4 shrink-0 text-brand cb-breathe" aria-hidden />
        <span key={phase} className="cb-step cb-shimmer">{t(`fitPhase.${phase}`)}…</span>
      </p>
      <span className="flex gap-1 ps-6" aria-hidden>
        {PHASES.map((item, index) => (
          <span key={item} className={cn("h-1 w-5 rounded-full transition-colors duration-300", index <= at ? "bg-brand" : "bg-muted-foreground/20")} />
        ))}
      </span>
    </div>
  )
}

/** Nothing to show: reloads the page once the job's insights (written after the save) are in. */
export function InsightsPending({ applicationId }: { applicationId: string }) {
  useApplicationSync(applicationId, { fit: false, insights: true }, null)
  return null
}
