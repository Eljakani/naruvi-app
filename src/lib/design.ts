/**
 * Document design tokens: everything a template can change. Shared by the
 * renderer (server), the template editor (client) and the AI design prompt.
 * Every combination stays a real-text, ATS-readable PDF.
 */
import { z } from "zod"

export const FONTS = {
  sans: { name: "Noto Sans", kind: "sans" },
  inter: { name: "Inter", kind: "sans" },
  lato: { name: "Lato", kind: "sans" },
  roboto: { name: "Roboto", kind: "sans" },
  plex: { name: "IBM Plex Sans", kind: "sans" },
  serif: { name: "Source Serif", kind: "serif" },
  merriweather: { name: "Merriweather", kind: "serif" },
  garamond: { name: "EB Garamond", kind: "serif" },
} as const
export type FontId = keyof typeof FONTS

const hex = z.string().regex(/^#[0-9a-f]{6}$/i)

export const designTokens = z.object({
  font: z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]).default("sans"),
  headingFont: z.enum(["same", ...(Object.keys(FONTS) as FontId[])] as [string, ...string[]]).default("same"),
  size: z.number().min(8).max(11.5).default(9.6),
  lineHeight: z.number().min(1.15).max(1.7).default(1.38),
  margin: z.number().min(20).max(60).default(38),
  spacing: z.number().min(0.6).max(1.6).default(1),
  accent: hex.default("#2563eb"),
  ink: hex.default("#111827"),
  accentName: z.boolean().default(false),
  accentHeadings: z.boolean().default(false),
  accentBullets: z.boolean().default(false),
  headingStyle: z.enum(["rule", "bar", "plain", "filled", "underline-accent"]).default("rule"),
  headingCase: z.enum(["upper", "none"]).default("upper"),
  nameSize: z.number().min(14).max(32).default(20),
  headerAlign: z.enum(["left", "center"]).default("left"),
  headerBand: z.boolean().default(false),
  layout: z.enum(["single", "sidebar"]).default("single"),
  bullet: z.enum(["dot", "dash", "arrow", "square", "none"]).default("dot"),
  datePosition: z.enum(["right", "below"]).default("right"),
  orgItalic: z.boolean().default(true),
  showLogos: z.boolean().default(true),
  photoShape: z.enum(["circle", "rounded", "square"]).default("circle"),
  // Page
  pageSize: z.enum(["A4", "LETTER"]).default("A4"),
  textAlign: z.enum(["left", "justify"]).default("left"),
  pageNumbers: z.boolean().default(false),
  // Header
  nameCase: z.enum(["none", "upper"]).default("none"),
  nameSpacing: z.number().min(0).max(4).default(0),
  photoSize: z.number().min(36).max(90).default(56),
  photoPosition: z.enum(["left", "right"]).default("left"),
  contactSeparator: z.enum(["space", "dot", "pipe"]).default("space"),
  contactLayout: z.enum(["inline", "stacked"]).default("inline"),
  linkStyle: z.enum(["url", "label"]).default("url"),
  accentLinks: z.boolean().default(false),
  contactIcons: z.boolean().default(false),
  // Summary paragraph under the header
  summaryStyle: z.enum(["plain", "italic", "bar", "box"]).default("plain"),
  summarySize: z.number().min(0.9).max(1.2).default(1),
  summaryAlign: z.enum(["auto", "left", "justify", "center"]).default("auto"),
  summaryLineHeight: z.number().min(1.15).max(1.7).default(1.38),
  summaryTitle: z.boolean().default(false),
  // Cover letter (same look as the CV, plus these)
  letterHeadline: z.boolean().default(true),
  letterPhoto: z.boolean().default(false),
  letterRecipient: z.boolean().default(true),
  letterDateAlign: z.enum(["right", "left"]).default("right"),
  letterSubject: z.enum(["plain", "accent", "caps"]).default("plain"),
  letterSpacing: z.number().min(0.6).max(1.8).default(1),
  letterSignature: z.enum(["name", "headline", "contact"]).default("name"),
  sectionIcons: z.boolean().default(false),
  // Sections
  headingSize: z.number().min(0.85).max(1.6).default(1.1),
  itemSpacing: z.number().min(0.4).max(2).default(1),
  bulletSpacing: z.number().min(0).max(4).default(1.5),
  skillsStyle: z.enum(["inline", "tags", "list"]).default("inline"),
  // Side column
  sidebarSide: z.enum(["left", "right"]).default("left"),
  sidebarWidth: z.number().min(24).max(40).default(31),
  sidebarTint: z.boolean().default(false),
})
export type DesignTokens = z.infer<typeof designTokens>

const base = designTokens.parse({})

/** Built-in starting points. */
export const PRESETS: Record<string, { name: string; hint: string; tokens: DesignTokens }> = {
  classic: { name: "Classic", hint: "Neutral sans, uppercase headings with a rule", tokens: base },
  modern: { name: "Modern", hint: "Inter, accent bars and name", tokens: { ...base, font: "inter", accentName: true, accentHeadings: true, accentBullets: true, headingStyle: "bar", headingCase: "none", orgItalic: false, size: 9.5 } },
  serif: { name: "Serif", hint: "Traditional: law, academia, finance", tokens: { ...base, font: "serif", size: 10 } },
  minimal: { name: "Minimal", hint: "Lots of white space, no lines", tokens: { ...base, font: "lato", headingStyle: "plain", headingCase: "none", margin: 46, spacing: 1.25, lineHeight: 1.45, showLogos: false, orgItalic: false } },
  compact: { name: "Compact", hint: "Fits a lot on one page", tokens: { ...base, font: "roboto", size: 8.8, lineHeight: 1.28, margin: 26, spacing: 0.75, nameSize: 17 } },
  executive: { name: "Executive", hint: "Garamond, centred header, refined", tokens: { ...base, font: "garamond", size: 10.6, nameSize: 26, headerAlign: "center", headingStyle: "underline-accent", accent: "#1e3a5f", accentHeadings: true, showLogos: false } },
  sidebar: { name: "Sidebar", hint: "Skills and languages in a side column", tokens: { ...base, font: "plex", layout: "sidebar", accentName: true, accentHeadings: true, headingStyle: "plain", headingCase: "upper", accent: "#0f766e" } },
  tech: { name: "Tech", hint: "Side column on the right, skills as tags", tokens: { ...base, font: "plex", layout: "sidebar", sidebarSide: "right", sidebarTint: true, skillsStyle: "tags", accent: "#2563eb", accentName: true, accentHeadings: true, accentLinks: true, headingStyle: "bar", headingCase: "none", linkStyle: "label", contactSeparator: "dot", orgItalic: false } },
  elegant: { name: "Elegant", hint: "Spaced capitals, justified text, quiet accents", tokens: { ...base, font: "merriweather", headingFont: "same", size: 9.4, nameCase: "upper", nameSpacing: 2.5, nameSize: 22, headerAlign: "center", contactSeparator: "pipe", headingStyle: "underline-accent", accent: "#7c2d12", accentHeadings: true, accentLinks: true, textAlign: "justify", showLogos: false, lineHeight: 1.45 } },
  bold: { name: "Bold", hint: "Coloured header band, strong headings", tokens: { ...base, font: "inter", headerBand: true, headingStyle: "filled", accent: "#4338ca", accentHeadings: true, nameSize: 24, orgItalic: false } },
}
export type PresetId = keyof typeof PRESETS

export const presetTokens = (template: string | undefined) => (PRESETS[template ?? "classic"] ?? PRESETS.classic).tokens
