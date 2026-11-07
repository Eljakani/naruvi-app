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
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <NaruviMark className="size-5" />
              </div>
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

function ActiveSettingsLink() {
  return <SettingsLink pathname={usePathname()} />
}

/** Counts refresh on every page change, so they follow what you just did. */
function useNavCounts(pathname: string | null) {
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  React.useEffect(() => {
    let current = true
    void navCountsAction().then((next) => {
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
      className="relative text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 data-active:text-sidebar-foreground [&_svg]:text-muted-foreground [&_svg]:transition-colors hover:[&_svg]:text-sidebar-foreground data-active:[&_svg]:text-sidebar-foreground"
      render={<Link href={item.url} />}
    >
      {active ? <motion.span layoutId="nav-current" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-foreground group-data-[collapsible=icon]:inset-y-2" aria-hidden /> : null}
      <item.icon />
      <span>{item.title}</span>
    </SidebarMenuButton>
  )
}
