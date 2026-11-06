import { connection } from "next/server"
import { getProfile } from "@/server/profile/repository"
import { Suspense } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { CommandMenu } from "@/components/command-menu"
import { PageBreadcrumb } from "@/components/page-breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <Suspense fallback={<AppSidebar user={emptyIdentity} />}>
        <ProfileSidebar />
      </Suspense>
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
            <Suspense fallback={null}>
              <PageBreadcrumb />
            </Suspense>
          </div>
          <div className="ml-auto flex w-full max-w-64 justify-end px-4">
            <CommandMenu />
          </div>
        </header>
        <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}


const emptyIdentity = { name: "Your profile", email: "", avatar: "" }

async function ProfileSidebar() {
  await connection()
  const profile = await getProfile()
  return <AppSidebar user={profile ? {
    name: profile.fullName.trim() || emptyIdentity.name,
    email: profile.email || profile.location,
    avatar: profile.photoPath ? `/api/assets/${profile.photoPath}` : "",
  } : emptyIdentity} />
}
