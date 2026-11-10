import { AuthSessionGuard } from "@/components/auth/auth-session-guard"
import { connection } from "next/server"
import { getProfile } from "@/server/profile/repository"
import { Suspense } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { CommandMenu } from "@/components/command-menu"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { AssistantHeaderButton, AssistantPanel, AssistantProvider } from "@/components/assistant/assistant-panel"
import { PageBreadcrumb } from "@/components/page-breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { getTranslations } from "next-intl/server"

export default function AppLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <AssistantProvider>
      <AuthSessionGuard />
      <SidebarProvider className="group/workspace">
        <Suspense fallback={<AppSidebar user={{ name: "", email: "", avatar: "" }} />}>
          <ProfileSidebar />
        </Suspense>
        <SidebarInset className="@container/workspace min-w-0 max-lg:group-has-[[data-assistant-open]]/workspace:hidden">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex min-w-0 items-center gap-2 px-4">
              <SidebarTrigger className="-ms-1" />
              <Separator orientation="vertical" className="me-2 data-vertical:h-4 data-vertical:self-auto" />
              <Suspense fallback={null}>
                <PageBreadcrumb />
              </Suspense>
            </div>
            <div className="ms-auto flex min-w-0 items-center justify-end gap-1 px-4">
              <AssistantHeaderButton />
              <ThemeToggle />
              <Suspense fallback={null}>
                <NotificationBell />
              </Suspense>
              <CommandMenu />
            </div>
          </header>
          <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
        </SidebarInset>
        <AssistantPanel />
      </SidebarProvider>
    </AssistantProvider>
  )
}


async function ProfileSidebar() {
  await connection()
  const profile = await getProfile()
  const emptyIdentity = { name: (await getTranslations("nav"))("yourProfile"), email: "", avatar: "" }
  return <AppSidebar user={profile ? {
    name: profile.fullName.trim() || emptyIdentity.name,
    email: profile.email || profile.location,
    avatar: profile.photoPath ? `/api/assets/${profile.photoPath}` : "",
  } : emptyIdentity} />
}
