"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { Suspense } from "react"
import { PlusIcon } from "lucide-react"
import { AddJobDialog } from "@/components/jobs/job-reader"
import { AssistantSidebarItem } from "@/components/assistant/assistant-panel"
import { NaruviMark } from "@/components/naruvi-mark"
import { navCountsAction } from "@/app/(app)/nav/actions"
import { NAV_GROUPS, settingsItem, type NavItem } from "@/components/nav"
import { motion } from "motion/react"
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

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { user: { name: string; email: string; avatar: string } }) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" aria-label="Naruvi home" />}>
              <NaruviMark className="size-8 shrink-0" />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Naruvi</span>
                <span className="truncate text-xs text-muted-foreground">Local workspace</span>
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
                <SidebarMenuButton tooltip="Add a job" aria-label="Add a job" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground">
                  <PlusIcon />
                  <span>Add a job</span>
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
  if (!("week.sent" in counts)) return null
  const items = [
    { n: counts["week.sent"], one: "sent", many: "sent" },
    { n: counts["week.interviews"], one: "interview", many: "interviews" },
    { n: counts["week.offers"], one: "offer", many: "offers" },
  ].filter((item) => item.n)
  const line = counts["week.offers"]
    ? "An offer this week. That’s worth celebrating."
    : counts["week.interviews"]
      ? "They want to talk. Your work is paying off."
      : counts["week.sent"]
        ? "Good momentum. Keep the follow-ups coming."
        : counts["week.checked"]
          ? "You’ve been checking fits. Ready to send one?"
          : "A quiet week. One good application is enough to restart."
  return (
    <Link href="/" className="group/week mx-1 mb-1 grid gap-2 rounded-xl border border-brand/15 bg-gradient-to-br from-brand-soft/80 to-transparent p-3 transition-colors hover:border-brand/30 group-data-[collapsible=icon]:hidden">
      <span className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-content-center overflow-hidden rounded-full ring-1 ring-brand/25">
          <NaruviMark className="size-7" />
        </span>
        <span className="text-xs font-medium">This week</span>
      </span>
      {items.length ? (
        <span className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item.one} className="rounded-full bg-background/80 px-2 py-0.5 text-xs tabular-nums ring-1 ring-border">
              <span className="font-semibold">{item.n}</span> {item.n === 1 ? item.one : item.many}
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

const BADGE_LABEL: Record<string, string> = { "/": "things need your attention", "/jobs": "new job leads" }

function NavGroups({ pathname }: { pathname: string | null }) {
  const counts = useNavCounts(pathname)
  return NAV_GROUPS.map((group) => (
    <SidebarGroup key={group.label}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map((item) => {
          const count = counts[item.url] ?? 0
          return (
            <SidebarMenuItem key={item.url}>
              <NavLink item={item} active={isActive(pathname, item.url)} tooltip={count ? `${item.title} · ${count}` : item.title} />
              {count ? (
                <SidebarMenuBadge className="rounded-full bg-primary px-1.5 text-primary-foreground" aria-label={`${count} ${BADGE_LABEL[item.url]}`}>
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
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <NavLink item={settingsItem} active={isActive(pathname, settingsItem.url)} tooltip={settingsItem.title} />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/**
 * One nav entry. The current page reads clearly (full-strength text, a bar on
 * the edge that glides from item to item); others stay quieter, and hover is
 * lighter than "current" so the two never look the same.
 */
function NavLink({ item, active, tooltip }: { item: NavItem; active: boolean; tooltip: string }) {
  return (
    <SidebarMenuButton
      tooltip={tooltip}
      isActive={active}
      aria-current={active ? "page" : undefined}
      className="relative text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 data-active:text-sidebar-foreground [&_svg]:text-muted-foreground [&_svg]:transition-colors hover:[&_svg]:text-sidebar-foreground data-active:[&_svg]:text-brand"
      render={<Link href={item.url} />}
    >
      {active ? <motion.span layoutId="nav-current" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-foreground group-data-[collapsible=icon]:inset-y-2" aria-hidden /> : null}
      <item.icon />
      <span>{item.title}</span>
    </SidebarMenuButton>
  )
}
