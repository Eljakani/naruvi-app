"use client"

import { usePathname } from "next/navigation"
import { navItems } from "@/components/nav"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb"
import { useTranslations } from "next-intl"

export function PageBreadcrumb() {
  const pathname = usePathname()
  const t = useTranslations("nav.items")
  const item = navItems.find((nav) => (nav.url === "/" ? pathname === "/" : pathname.startsWith(nav.url)))
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage>{item ? t(`${item.key}.title`) : "Naruvi"}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}
