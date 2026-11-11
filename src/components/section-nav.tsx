"use client"

import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

export type SectionNavItem = { id: string; label: string; icon?: ReactNode; status?: boolean | null }

/**
 * The side menu for Settings and Integrations: one entry per section, the
 * section you're reading highlighted, and an On/Off dot where it applies.
 * Becomes a scrollable row on narrow screens.
 */
export function SectionNav({ items, label }: { items: SectionNavItem[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id)
  const t = useTranslations("common")
  useEffect(() => {
    const targets = items.map((item) => document.getElementById(item.id)).filter((node): node is HTMLElement => Boolean(node))
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: "-10% 0px -70% 0px" },
    )
    targets.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [items])

  return (
    <nav aria-label={label} className="relative -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 @4xl/workspace:sticky @4xl/workspace:top-4 @4xl/workspace:mx-0 @4xl/workspace:grid @4xl/workspace:overflow-visible @4xl/workspace:px-0 @4xl/workspace:pb-0">
      {items.map((item) => {
        const current = item.id === active
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={current ? "location" : undefined}
            onClick={() => setActive(item.id)}
            className={cn(
              "flex min-h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              current ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.icon ? <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4" aria-hidden>{item.icon}</span> : null}
            <span className="flex-1 whitespace-nowrap">{item.label}</span>
            {item.status === undefined || item.status === null ? null : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground" title={item.status ? t("connected") : t("notSetUp")}>
                <span className={cn("size-1.5 rounded-full", item.status ? "bg-primary" : "bg-muted-foreground/30")} aria-hidden />
                <span className="sr-only @4xl/workspace:not-sr-only">{item.status ? t("on") : t("off")}</span>
              </span>
            )}
          </a>
        )
      })}
    </nav>
  )
}

/** Side menu + one readable column. Shared by Settings and Integrations. */
export function SectionLayout({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-w-0 items-start gap-6 @4xl/workspace:grid-cols-[minmax(12rem,max-content)_minmax(0,1fr)] @4xl/workspace:gap-10">
      {nav}
      <div className="@container/settings grid min-w-0 max-w-4xl gap-10">{children}</div>
    </div>
  )
}

/** A titled group of cards. */
export function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="grid min-w-0 scroll-mt-6 gap-4">
      <div className="grid gap-1">
        <h2 id={`${id}-heading`} className="text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid min-w-0 gap-4">{children}</div>
    </section>
  )
}
