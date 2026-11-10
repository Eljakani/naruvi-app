"use client"

import Link from "next/link"
import { useRef } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChevronsUpDownIcon, SettingsIcon, UserRoundIcon, LogOutIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const t = useTranslations("nav")
  const logoutForm = useRef<HTMLFormElement>(null)
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase()
  return (
    <>
    <form ref={logoutForm} method="post" action="/auth/logout" hidden />
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" aria-label={t("profileMenu", { name: user.name })} className="aria-expanded:bg-muted" />
            }
          >
            <Avatar>
              {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-start text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              {user.email ? <span className="truncate text-xs text-muted-foreground">{user.email}</span> : null}
            </div>
            <ChevronsUpDownIcon className="ms-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64 max-w-[calc(100vw-2rem)]"
            side={isMobile ? "bottom" : "inline-end"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                  <Avatar>
                    {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-start text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    {user.email ? <span className="truncate text-xs text-muted-foreground">{user.email}</span> : null}
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/profile" />}>
                <UserRoundIcon /> {t("items.profile.title")}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <SettingsIcon /> {t("items.settings.title")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => logoutForm.current?.requestSubmit()}>
                <LogOutIcon /> {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
    </>
  )
}
