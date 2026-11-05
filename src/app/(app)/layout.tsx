import { Suspense } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { PageBreadcrumb } from "@/components/page-breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar user={{ name: "Local user", email: "Single-user · runs on your machine", avatar: "" }} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
            <Suspense fallback={null}>
              <PageBreadcrumb />
            </Suspense>
          </div>
        </header>
        <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
