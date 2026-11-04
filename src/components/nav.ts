import {
  BriefcaseBusinessIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  ScrollTextIcon,
  Settings2Icon,
  UserRoundIcon,
} from "lucide-react"

export type NavItem = { title: string; url: string; icon: LucideIcon; description: string }

export const navItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboardIcon, description: "Pipeline and next actions" },
  { title: "Applications", url: "/applications", icon: FileTextIcon, description: "Tailored CVs and letters" },
  { title: "Jobs", url: "/jobs", icon: BriefcaseBusinessIcon, description: "Parsed postings" },
  { title: "Profile", url: "/profile", icon: UserRoundIcon, description: "Verified facts — the source of truth" },
  { title: "Runs", url: "/runs", icon: ScrollTextIcon, description: "Agent traces and decisions" },
  { title: "Settings", url: "/settings", icon: Settings2Icon, description: "Model, compiler and data" },
]
