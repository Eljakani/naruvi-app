"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { SparklesIcon } from "lucide-react"
import { useTranslations } from "next-intl"

/** Shown while the automatic fit check runs in the background; refreshes the page until the result lands. */
export function FitChecking() {
  const t = useTranslations("application")
  const router = useRouter()
  useEffect(() => {
    let tries = 0
    // A check takes from a few seconds to a couple of minutes with a slow model; stop after ~3 min.
    const timer = setInterval(() => {
      tries += 1
      if (tries > 45) return clearInterval(timer)
      router.refresh()
    }, 4000)
    return () => clearInterval(timer)
  }, [router])
  return (
    <p role="status" className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
      <SparklesIcon className="size-4 shrink-0 text-brand cb-breathe" aria-hidden />
      <span className="cb-shimmer">{t("autoChecking")}</span>
    </p>
  )
}
