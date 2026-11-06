import { BriefcaseBusinessIcon, Building2Icon, FileTextIcon, LayoutDashboardIcon, PaletteIcon, ScrollTextIcon, Settings2Icon, UserRoundIcon, type LucideIcon } from "lucide-react"

export type NavItem = { title: string; url: string; icon: LucideIcon; description: string }

export const navItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboardIcon, description: "Pipeline and next actions" },
  { title: "Applications", url: "/applications", icon: FileTextIcon, description: "Tailored CVs and letters" },
  { title: "Jobs", url: "/jobs", icon: BriefcaseBusinessIcon, description: "Parsed postings" },
  { title: "Companies", url: "/companies", icon: Building2Icon, description: "Every job and application per company" },
  { title: "Profile", url: "/profile", icon: UserRoundIcon, description: "Verified facts — the source of truth" },
  { title: "Templates", url: "/templates", icon: PaletteIcon, description: "How your documents look" },
  { title: "Runs", url: "/runs", icon: ScrollTextIcon, description: "Agent traces and decisions" },
  { title: "Settings", url: "/settings", icon: Settings2Icon, description: "Model, compiler and data" },
]
