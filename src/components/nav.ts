import { Building2Icon, CompassIcon, ContactRoundIcon, FileTextIcon, LayoutDashboardIcon, PaletteIcon, PlugIcon, ScrollTextIcon, Settings2Icon, UserRoundIcon, type LucideIcon } from "lucide-react"

export type NavItem = { title: string; url: string; icon: LucideIcon; description: string }

/** The sidebar, in the order of a job search: find and track, prepare your material, connect and inspect. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Job search",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboardIcon, description: "Pipeline and next actions" },
      { title: "Jobs", url: "/jobs", icon: CompassIcon, description: "New postings to look at, not tracked yet" },
      { title: "Applications", url: "/applications", icon: FileTextIcon, description: "Every job you're pursuing, saved to offer" },
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
      { title: "Naruvi’s work", url: "/runs", icon: ScrollTextIcon, description: "What Naruvi did, step by step" },
    ],
  },
]

/** Kept at the bottom of the sidebar, next to the user menu. */
export const settingsItem: NavItem = { title: "Settings", url: "/settings", icon: Settings2Icon, description: "Documents, fonts and data" }

/** Every page, for breadcrumbs and lookups. */
export const navItems: NavItem[] = [...NAV_GROUPS.flatMap((group) => group.items), settingsItem]
