import { Building2Icon, CompassIcon, ContactRoundIcon, FileTextIcon, LayoutDashboardIcon, PaletteIcon, PlugIcon, ScrollTextIcon, Settings2Icon, UserRoundIcon, type LucideIcon } from "lucide-react"

/** Titles and descriptions live in the `nav` message catalog under `items.<key>`. */
export type NavKey = "dashboard" | "jobs" | "applications" | "companies" | "contacts" | "profile" | "templates" | "integrations" | "runs" | "settings"
export type NavItem = { key: NavKey; url: string; icon: LucideIcon }

/** The sidebar, in the order of a job search: find and track, prepare your material, connect and inspect. */
export const NAV_GROUPS: { key: "search" | "material" | "workspace"; items: NavItem[] }[] = [
  {
    key: "search",
    items: [
      { key: "dashboard", url: "/", icon: LayoutDashboardIcon },
      { key: "jobs", url: "/jobs", icon: CompassIcon },
      { key: "applications", url: "/applications", icon: FileTextIcon },
      { key: "companies", url: "/companies", icon: Building2Icon },
      { key: "contacts", url: "/contacts", icon: ContactRoundIcon },
    ],
  },
  {
    key: "material",
    items: [
      { key: "profile", url: "/profile", icon: UserRoundIcon },
      { key: "templates", url: "/templates", icon: PaletteIcon },
    ],
  },
  {
    key: "workspace",
    items: [
      { key: "integrations", url: "/integrations", icon: PlugIcon },
      { key: "runs", url: "/runs", icon: ScrollTextIcon },
    ],
  },
]

/** Kept at the bottom of the sidebar, next to the user menu. */
export const settingsItem: NavItem = { key: "settings", url: "/settings", icon: Settings2Icon }

/** Every page, for breadcrumbs and lookups. */
export const navItems: NavItem[] = [...NAV_GROUPS.flatMap((group) => group.items), settingsItem]
