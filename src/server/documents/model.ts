/**
 * The CV as structured data. Rendered by templates (PDF today); stored on
 * immutable revisions. Every bullet keeps the ids that ground it.
 */
import { z } from "zod"

export const cvBullet = z.object({
  id: z.string(),
  text: z.string().min(1).max(600),
  /** "phrasing" = user-approved wording; "fact" = a verified fact used as-is. */
  source: z.enum(["phrasing", "fact"]),
  phrasingId: z.string().nullable().default(null),
  factIds: z.array(z.string()).default([]),
  included: z.boolean().default(true),
})

export const cvItem = z.object({
  entryId: z.string(),
  title: z.string(),
  organization: z.string().default(""),
  dates: z.string().default(""),
  location: z.string().default(""),
  logoPath: z.string().nullable().default(null),
  included: z.boolean().default(true),
  bullets: z.array(cvBullet).default([]),
})

export const sectionKinds = ["experience", "education", "project", "certification", "achievement", "skills", "languages"] as const

export const cvSection = z.object({
  id: z.string(),
  kind: z.enum(sectionKinds),
  title: z.string(),
  included: z.boolean().default(true),
  items: z.array(cvItem).default([]),
  /** For skills/languages: label → values. */
  groups: z.array(z.object({ label: z.string(), values: z.array(z.string()) })).default([]),
})

export const cvDocument = z.object({
  version: z.literal(1),
  language: z.string().regex(/^[a-z]{2}$/),
  template: z.enum(["classic"]).default("classic"),
  header: z.object({
    name: z.string(),
    headline: z.string().default(""),
    email: z.string().default(""),
    phone: z.string().default(""),
    location: z.string().default(""),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
    photoPath: z.string().nullable().default(null),
    showPhoto: z.boolean().default(false),
  }),
  sections: z.array(cvSection),
  /** Entries left out because they had no approved wording in this language. */
  missingTranslations: z.array(z.object({ entryId: z.string(), title: z.string() })).default([]),
})

export type CvBullet = z.infer<typeof cvBullet>
export type CvItem = z.infer<typeof cvItem>
export type CvSection = z.infer<typeof cvSection>
export type CvDocument = z.infer<typeof cvDocument>

/** Section headings per language; unknown languages fall back to English. */
export const SECTION_TITLES: Record<string, Record<(typeof sectionKinds)[number], string>> = {
  en: { experience: "Experience", education: "Education", project: "Projects", certification: "Certifications", achievement: "Achievements", skills: "Skills", languages: "Languages" },
  fr: { experience: "Expérience professionnelle", education: "Formation", project: "Projets", certification: "Certifications", achievement: "Distinctions", skills: "Compétences", languages: "Langues" },
  es: { experience: "Experiencia", education: "Formación", project: "Proyectos", certification: "Certificaciones", achievement: "Logros", skills: "Competencias", languages: "Idiomas" },
  de: { experience: "Berufserfahrung", education: "Ausbildung", project: "Projekte", certification: "Zertifikate", achievement: "Auszeichnungen", skills: "Kenntnisse", languages: "Sprachen" },
}

export function sectionTitle(kind: (typeof sectionKinds)[number], language: string) {
  return (SECTION_TITLES[language] ?? SECTION_TITLES.en)[kind]
}

/** Plain text of what is included (for checks and keyword coverage). */
export function documentText(doc: CvDocument) {
  const parts = [doc.header.name, doc.header.headline]
  for (const section of doc.sections.filter((s) => s.included)) {
    parts.push(section.title)
    for (const item of section.items.filter((i) => i.included)) {
      parts.push(item.title, item.organization)
      for (const bullet of item.bullets.filter((b) => b.included)) parts.push(bullet.text)
    }
    for (const group of section.groups) parts.push(group.label, group.values.join(", "))
  }
  return parts.filter(Boolean).join("\n")
}
