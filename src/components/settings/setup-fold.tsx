"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

/** An integration that is off: one line with "Set up" until opened, so the page stays scannable. */
export function SetupFold({ id, label, icon, off, children }: { id: string; label: string; icon: ReactNode; off: boolean; children: ReactNode }) {
  const t = useTranslations("integrations.fold")
  const [open, setOpen] = useState(!off)
  // The side navigation links here by hash: following it opens the card.
  useEffect(() => {
    if (!off) return
    const check = () => {
      if (window.location.hash === `#${id}`) setOpen(true)
    }
    check()
    window.addEventListener("hashchange", check)
    return () => window.removeEventListener("hashchange", check)
  }, [id, off])
  return (
    <div id={id} className="scroll-mt-6">
      {open ? children : (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon}
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{t("off")}</span>
          <Button size="sm" variant="outline" aria-label={t("setUpLabel", { name: label })} onClick={() => setOpen(true)}>{t("setUp")}</Button>
        </div>
      )}
    </div>
  )
}
