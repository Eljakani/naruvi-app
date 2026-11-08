"use client"

import { useEffect } from "react"
import { authDestination } from "@/lib/auth-navigation"

/** Re-check restored/foreground tabs without extending the idle session lifetime. */
export function AuthSessionGuard({ guest = false, destination = "/" }: { guest?: boolean; destination?: string }) {
  useEffect(() => {
    let stopped = false
    let checking = false
    const abort = new AbortController()
    async function check() {
      if (checking || document.visibilityState === "hidden") return
      checking = true
      try {
        const response = await fetch("/auth/session", { cache: "no-store", signal: abort.signal })
        if (stopped) return
        if (guest && response.status === 204) window.location.replace(authDestination(destination))
        if (!guest && response.status === 401) {
          const query = new URLSearchParams({ notice: "session-expired", next: authDestination(window.location.pathname + window.location.search) })
          window.location.replace(`/login?${query}`)
        }
      } catch { /* A network outage does not mean the user signed out. */ }
      finally { checking = false }
    }
    function restored(event: PageTransitionEvent) { if (event.persisted) window.location.reload() }
    void check()
    window.addEventListener("pageshow", restored)
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", check)
    const timer = setInterval(check, 60_000)
    return () => {
      stopped = true
      abort.abort()
      clearInterval(timer)
      window.removeEventListener("pageshow", restored)
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", check)
    }
  }, [guest, destination])
  return null
}
