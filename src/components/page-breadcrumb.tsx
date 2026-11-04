"use client"

import { usePathname } from "next/navigation"
import { navItems } from "@/components/nav"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb"

export function PageBreadcrumb() {
  const pathname = usePathname()
  const item = navItems.find((nav) => (nav.url === "/" ? pathname === "/" : pathname.startsWith(nav.url)))
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>{item?.title ?? "CareerBuddy"}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
