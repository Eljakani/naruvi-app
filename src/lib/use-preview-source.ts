"use client"

import { useSyncExternalStore } from "react"

/**
 * The server's fingerprint of what template previews draw (latest CV, photo, profile text,
 * renderer). Previews key on it, so when it changes they re-render instead of showing stale
 * content. Checked when the tab regains focus and every 20 s while visible; one check is
 * shared by every preview on the page.
 */
let current: string | null = null
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

async function check() {
  if (document.visibilityState === "hidden") return
  const response = await fetch("/api/templates/preview", { cache: "no-store" }).catch(() => null)
  const source = response?.ok ? ((await response.json().catch(() => null)) as { source?: string } | null)?.source : undefined
  if (source && source !== current) {
    current = source
    for (const listener of listeners) listener()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    timer = setInterval(check, 20_000)
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)
    void check()
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(timer)
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
    }
  }
}

/** `initial` is the fingerprint the page was rendered with (if any). */
export function usePreviewSource(initial?: string) {
  return useSyncExternalStore(subscribe, () => current ?? initial ?? "", () => initial ?? "")
}
