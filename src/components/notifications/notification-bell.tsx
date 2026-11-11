"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AlarmClockIcon, BellIcon, BriefcaseBusinessIcon, CalendarCheckIcon, CheckIcon, CircleAlertIcon, MailIcon, MailXIcon, PartyPopperIcon, type LucideIcon } from "lucide-react"
import { inboxAction, markInboxSeenAction } from "@/app/[locale]/(app)/nav/notifications"
import { Otter } from "@/components/naruvi/otter"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ago } from "@/components/runs/labels"
import { cn } from "@/lib/utils"
import type { InboxItem } from "@/server/notifications/inbox"
import { useLocale, useNow, useTranslations } from "next-intl"

const ICON: Record<InboxItem["kind"], [LucideIcon, string]> = {
  interview: [CalendarCheckIcon, "text-brand"],
  offer: [PartyPopperIcon, "text-brand"],
  rejection: [MailXIcon, "text-muted-foreground"],
  reply: [MailIcon, "text-foreground"],
  due: [AlarmClockIcon, "text-amber-600 dark:text-amber-400"],
  leads: [BriefcaseBusinessIcon, "text-foreground"],
  done: [CheckIcon, "text-emerald-600 dark:text-emerald-400"],
  failed: [CircleAlertIcon, "text-destructive"],
}
/** Worth interrupting you with a toast when it arrives while you're in the app. */
const TOAST: InboxItem["kind"][] = ["interview", "offer", "reply", "rejection", "done", "failed"]
const POLL_MS = 60_000

export function NotificationBell() {
  const router = useRouter()
  const pathname = usePathname()
  const [items, setItems] = useState<InboxItem[]>([])
  const [seenAt, setSeenAt] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const t = useTranslations("inbox")
  const locale = useLocale()
  const now = useNow({ updateInterval: 60_000 })
  const known = useRef<Set<string> | null>(null)

  const load = useCallback(async () => {
    if (document.visibilityState === "hidden") return
    const next = await inboxAction()
    setItems(next.items)
    setSeenAt((current) => current && current > next.seenAt ? current : next.seenAt)
    // The first load only learns what exists; later loads toast what's new since then.
    if (known.current) {
      const fresh = next.items.filter((item) => !known.current!.has(item.id) && TOAST.includes(item.kind)).slice(0, 2)
      for (const item of fresh) {
        const [Icon, tone] = ICON[item.kind]
        toast(item.title, { description: item.body, icon: <Icon className={cn("size-4", tone)} />, action: { label: t("open"), onClick: () => router.push(item.href) } })
      }
    }
    known.current = new Set(next.items.map((item) => item.id))
  }, [router, t])

  useEffect(() => {
    const first = window.setTimeout(load, 0)
    const timer = window.setInterval(load, POLL_MS)
    const onFocus = () => void load()
    window.addEventListener("focus", onFocus)
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener("focus", onFocus) }
  }, [load, pathname])

  const unread = seenAt ? items.filter((item) => item.at > seenAt).length : 0
  const openChange = (next: boolean) => {
    setOpen(next)
    // Opening the inbox counts as seeing it; the dots stay until you close it so you can still tell what was new.
    if (!next && unread) {
      setSeenAt(new Date().toISOString())
      void markInboxSeenAction()
    }
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger render={
        <Button size="icon-sm" variant="ghost" className="relative" aria-label={unread ? t("labelUnread", { count: unread }) : t("title")} />
      }>
        <BellIcon className={cn(unread && "naruvi-bell-ring")} />
        {unread ? (
          <span aria-hidden className="cb-pop pointer-events-none absolute top-0.5 end-0.5 grid h-3.5 min-w-3.5 place-content-center rounded-full bg-brand px-0.5 text-[9px] leading-none font-semibold text-brand-foreground ring-2 ring-background tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-3.5 py-2.5">
          <p className="text-sm font-semibold">{t("title")}</p>
          {unread ? <span className="text-xs text-brand">{t("newCount", { count: unread })}</span> : null}
        </div>
        {items.length ? (
          <ul className="max-h-[min(26rem,70vh)] divide-y overflow-y-auto overscroll-contain">
            {items.map((item) => {
              const [Icon, tone] = ICON[item.kind]
              const fresh = seenAt !== null && item.at > seenAt
              return (
                <li key={item.id}>
                  <Link href={item.href} onClick={() => openChange(false)} className={cn("flex gap-3 px-3.5 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none", fresh && "bg-brand-soft/40")}>
                    <span className="grid size-8 shrink-0 place-content-center rounded-full border bg-background"><Icon className={cn("size-4", tone)} /></span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                        <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground">{item.kind === "due" ? t("today") : ago(new Date(item.at), now.getTime(), locale)}</time>
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>
                    </span>
                    {fresh ? <span aria-label={t("new")} className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" /> : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="grid justify-items-center gap-2 px-6 py-8 text-center">
            <Otter pose="all-checked" height={84} />
            <p className="text-sm font-medium">{t("emptyTitle")}</p>
            <p className="text-xs text-pretty text-muted-foreground">{t("emptyBody")}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
