import { BriefcaseBusinessIcon, Building2Icon, ContactRoundIcon, FileTextIcon, LayoutDashboardIcon, PaletteIcon, PlugIcon, ScrollTextIcon, Settings2Icon, UserRoundIcon, type LucideIcon } from "lucide-react"

export type NavItem = { title: string; url: string; icon: LucideIcon; description: string }

/** The sidebar, in the order of a job search: find and track, prepare your material, connect and inspect. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Job search",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboardIcon, description: "Pipeline and next actions" },
      { title: "Applications", url: "/applications", icon: FileTextIcon, description: "Tailored CVs and letters" },
      { title: "Jobs", url: "/jobs", icon: BriefcaseBusinessIcon, description: "Parsed postings" },
      { title: "Companies", url: "/companies", icon: Building2Icon, description: "Every job and application per company" },
      { title: "Contacts", url: "/contacts", icon: ContactRoundIcon, description: "Recruiters, HR and hiring managers" },
    ],
  },
  {
    label: "Your material",
    items: [
      { title: "Profile", url: "/profile", icon: UserRoundIcon, description: "Verified facts — the source of truth" },
      { title: "Templates", url: "/templates", icon: PaletteIcon, description: "How your documents look" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { title: "Integrations", url: "/integrations", icon: PlugIcon, description: "Email, calendar and other connections" },
      { title: "AI activity", url: "/runs", icon: ScrollTextIcon, description: "What the AI did, step by step" },
    ],
  },
]

/** Kept at the bottom of the sidebar, next to the user menu. */
export const settingsItem: NavItem = { title: "Settings", url: "/settings", icon: Settings2Icon, description: "Model, compiler and data" }

/** Every page, for breadcrumbs and lookups. */
export const navItems: NavItem[] = [...NAV_GROUPS.flatMap((group) => group.items), settingsItem]
