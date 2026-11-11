"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { Suspense } from "react"
import { PlusIcon } from "lucide-react"
import { AddJobDialog } from "@/components/jobs/add-job-dialog"
import { AssistantSidebarItem } from "@/components/assistant/assistant-panel"
import { NaruviMark } from "@/components/naruvi-mark"
import { navCountsAction } from "@/app/[locale]/(app)/nav/actions"
import { NAV_GROUPS, settingsItem, type NavItem } from "@/components/nav"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useTranslations } from "next-intl"

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: { name: string; email: string; avatar: string } }) {
  const t = useTranslations("nav")
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" aria-label={t("home")} />}>
              <NaruviMark className="size-8 shrink-0" />
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">Naruvi</span>
                <span className="truncate text-xs text-muted-foreground">{t("localWorkspace")}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <AddJobDialog trigger={
                <SidebarMenuButton tooltip={t("addJob")} aria-label={t("addJob")} className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground">
                  <PlusIcon />
                  <span>{t("addJob")}</span>
                </SidebarMenuButton>
              } />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <AssistantSidebarItem />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <Suspense fallback={<NavGroups pathname={null} />}>
          <ActiveNavGroups />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={null}>
          <ActiveWeekCard />
        </Suspense>
        <Suspense fallback={<SettingsLink pathname={null} />}>
          <ActiveSettingsLink />
        </Suspense>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

const isActive = (pathname: string | null, url: string) => pathname !== null && (url === "/" ? pathname === "/" : pathname.startsWith(url))

function ActiveNavGroups() {
  return <NavGroups pathname={usePathname()} />
}

function ActiveWeekCard() {
  return <WeekCard counts={useNavCounts(usePathname())} />
}

/** Naruvi's short weekly recap in the sidebar's spare space: real numbers, one encouraging line. */
function WeekCard({ counts }: { counts: Record<string, number> }) {
  const t = useTranslations("nav.week")
  if (!("week.sent" in counts)) return null
  const items = (["sent", "interviews", "offers"] as const).map((key) => ({ key, n: counts[`week.${key}`] })).filter((item) => item.n)
  const line = t(counts["week.offers"] ? "offer" : counts["week.interviews"] ? "interviews" : counts["week.sent"] ? "sent" : counts["week.checked"] ? "checked" : "quiet")
  return (
    <Link href="/" className="group/week mx-1 mb-1 grid gap-2 rounded-xl border border-brand/15 bg-gradient-to-br from-brand-soft/80 to-transparent p-3 transition-colors hover:border-brand/30 group-data-[collapsible=icon]:hidden">
      <span className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-content-center overflow-hidden rounded-full ring-1 ring-brand/25">
          <NaruviMark className="size-7" />
        </span>
        <span className="text-xs font-medium">{t("title")}</span>
      </span>
      {items.length ? (
        <span className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item.key} className="rounded-full bg-background/80 px-2 py-0.5 text-xs tabular-nums ring-1 ring-border">
              {t.rich(`count.${item.key}`, { n: item.n, b: (chunks) => <span className="font-semibold">{chunks}</span> })}
            </span>
          ))}
        </span>
      ) : null}
      <span className="text-xs leading-snug text-pretty text-muted-foreground group-hover/week:text-foreground">{line}</span>
    </Link>
  )
}

function ActiveSettingsLink() {
  return <SettingsLink pathname={usePathname()} />
}

/** Counts refresh on every page change, so they follow what you just did. The nav and the week card share one request. */
let shared: { key: string | null; request: Promise<Record<string, number>> } | null = null
function useNavCounts(pathname: string | null) {
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  React.useEffect(() => {
    let current = true
    if (!shared || shared.key !== pathname) shared = { key: pathname, request: navCountsAction() }
    void shared.request.then((next) => {
      if (current) setCounts(next)
    })
    return () => {
      current = false
    }
  }, [pathname])
  return counts
}

function NavGroups({ pathname }: { pathname: string | null }) {
  const counts = useNavCounts(pathname)
  const t = useTranslations("nav")
  return NAV_GROUPS.map((group) => (
    <SidebarGroup key={group.key}>
      <SidebarGroupLabel>{t(`groups.${group.key}`)}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map((item) => {
          const count = counts[item.url] ?? 0
          return (
            <SidebarMenuItem key={item.url}>
              <NavLink item={item} active={isActive(pathname, item.url)} tooltip={count ? `${t(`items.${item.key}.title`)} · ${count}` : t(`items.${item.key}.title`)} />
              {count ? (
                <SidebarMenuBadge className={item.url === "/applications" ? "font-semibold text-brand" : "font-normal text-muted-foreground"} aria-label={item.url === "/applications" ? t("badge.applications", { count }) : t("badge.jobs", { count })}>
                  {count > 99 ? "99+" : count}
                </SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  ))
}

function SettingsLink({ pathname }: { pathname: string | null }) {
  const t = useTranslations("nav.items")
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <NavLink item={settingsItem} active={isActive(pathname, settingsItem.url)} tooltip={t("settings.title")} />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/**
 * One nav entry. The current page reads clearly (soft fill, full-strength text,
 * copper icon); others stay quieter, and hover is lighter than "current".
 */
function NavLink({ item, active, tooltip }: { item: NavItem; active: boolean; tooltip: string }) {
  const t = useTranslations("nav.items")
  return (
    <SidebarMenuButton
      tooltip={tooltip}
      isActive={active}
      aria-current={active ? "page" : undefined}
      className="text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 data-active:text-sidebar-foreground [&_svg]:text-muted-foreground [&_svg]:transition-colors hover:[&_svg]:text-sidebar-foreground data-active:[&_svg]:text-brand"
      render={<Link href={item.url} />}
    >
      <item.icon />
      <span>{t(`${item.key}.title`)}</span>
    </SidebarMenuButton>
  )
}
