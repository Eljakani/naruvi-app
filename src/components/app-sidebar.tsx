"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { Suspense } from "react"
import { PlusIcon } from "lucide-react"
import { AddJobDialog } from "@/components/jobs/job-reader"
import { NaruviMark } from "@/components/naruvi-mark"
import { navCountsAction } from "@/app/(app)/nav/actions"
import { NAV_GROUPS, settingsItem } from "@/components/nav"
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
              <SidebarMenuButton tooltip={count ? `${item.title} · ${count}` : item.title} isActive={isActive(pathname, item.url)} render={<Link href={item.url} />}>
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
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
        <SidebarMenuButton tooltip={settingsItem.title} isActive={isActive(pathname, settingsItem.url)} render={<Link href={settingsItem.url} />}>
          <settingsItem.icon />
          <span>{settingsItem.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
