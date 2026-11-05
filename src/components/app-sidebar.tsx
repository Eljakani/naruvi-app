"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { Suspense } from "react"
import { NaruviMark } from "@/components/naruvi-mark"
import { navItems } from "@/components/nav"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
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
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <Suspense fallback={<NavLinks pathname={null} />}>
            <ActiveNavLinks />
          </Suspense>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />
}

function NavLinks({ pathname }: { pathname: string | null }) {
  const isActive = (url: string) => pathname !== null && (url === "/" ? pathname === "/" : pathname.startsWith(url))
  return (
    <SidebarMenu>
      {navItems.map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton tooltip={item.title} isActive={isActive(item.url)} render={<Link href={item.url} />}>
            <item.icon />
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
