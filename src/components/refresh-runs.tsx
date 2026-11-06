"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function RefreshRuns() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCwIcon className={pending ? "animate-spin" : ""} /> Refresh</Button>
}

/** Refreshes the page every few seconds while something is still running. */
export function LiveRefresh({ active, every = 3000 }: { active: boolean; every?: number }) {
  const router = useRouter()
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => { if (document.visibilityState === "visible") router.refresh() }, every)
    return () => clearInterval(timer)
  }, [active, every, router])
  return null
}
