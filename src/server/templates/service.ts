import "server-only"
import { desc, eq } from "drizzle-orm"
import { designTokens, PRESETS, type DesignTokens } from "@/lib/design"
import { db } from "@/server/db/client"
import { documents, revisions, templates, templateVersions } from "@/server/db/schema"
import { cvDocument, type CvDocument } from "@/server/documents/model"
import { renderCvPdf } from "@/server/documents/render"

export type SavedTemplate = { id: string; name: string; basedOn: string; tokens: DesignTokens; updatedAt: Date }

const parse = (row: typeof templates.$inferSelect): SavedTemplate => ({ id: row.id, name: row.name, basedOn: row.basedOn, tokens: designTokens.parse(row.tokens), updatedAt: row.updatedAt })

export async function listTemplates() {
  return (await db.select().from(templates).orderBy(desc(templates.updatedAt))).map(parse)
}

export async function getTemplate(id: string) {
  const [row] = await db.select().from(templates).where(eq(templates.id, id))
  return row ? parse(row) : null
}

export async function createTemplate(input: { name: string; basedOn: string; tokens: unknown; note?: string }) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(templates).values({ name: input.name.trim().slice(0, 80) || "My template", basedOn: PRESETS[input.basedOn] ? input.basedOn : "classic", tokens: designTokens.parse(input.tokens) }).returning()
    await tx.insert(templateVersions).values({ templateId: row.id, name: row.name, tokens: row.tokens, note: input.note || "created" })
    return parse(row)
  })
}

/** Every save is a version, so any earlier look can be restored. */
export async function updateTemplate(id: string, input: { name?: string; tokens?: unknown; note?: string }) {
  return db.transaction(async (tx) => {
    const [row] = await tx.update(templates).set({ ...(input.name ? { name: input.name.trim().slice(0, 80) } : {}), ...(input.tokens ? { tokens: designTokens.parse(input.tokens) } : {}) }).where(eq(templates.id, id)).returning()
    if (!row) return null
    await tx.insert(templateVersions).values({ templateId: id, name: row.name, tokens: row.tokens, note: input.note || "saved" })
    return parse(row)
  })
}

export async function listTemplateVersions(templateId: string) {
  const rows = await db.select().from(templateVersions).where(eq(templateVersions.templateId, templateId)).orderBy(desc(templateVersions.createdAt)).limit(50)
  return rows.map((row) => ({ id: row.id, name: row.name, note: row.note, createdAt: row.createdAt, tokens: designTokens.parse(row.tokens) }))
}
export type TemplateVersion = Awaited<ReturnType<typeof listTemplateVersions>>[number]

export async function restoreTemplateVersion(templateId: string, versionId: string) {
  const [version] = await db.select().from(templateVersions).where(eq(templateVersions.id, versionId))
  if (!version || version.templateId !== templateId) return null
  return updateTemplate(templateId, { tokens: version.tokens, note: `restored ${version.createdAt.toISOString()}` })
}

export async function deleteTemplate(id: string) {
  await db.delete(templates).where(eq(templates.id, id))
}

/** Built-in sample used when the person has not generated a CV yet. */
const SAMPLE: CvDocument = cvDocument.parse({
  version: 1, language: "en",
  header: { name: "Alex Morgan", headline: "Product designer — research, prototyping and design systems", email: "alex@example.org", phone: "+44 20 7946 0000", location: "London, UK", links: [{ label: "Portfolio", url: "https://example.org" }] },
  sections: [
    { id: "experience", kind: "experience", title: "Experience", items: [
      { entryId: "a", title: "Senior Product Designer", organization: "Northwind", dates: "2022 – Present", location: "London", bullets: [
        { id: "1", text: "Led the redesign of the checkout flow, lifting conversion by 12%.", source: "fact", factIds: ["x"] },
        { id: "2", text: "Built and documented a design system used by 6 product teams.", source: "fact", factIds: ["x"] },
        { id: "3", text: "Ran 40+ user interviews to shape the 2024 roadmap.", source: "fact", factIds: ["x"] },
      ] },
      { entryId: "b", title: "Product Designer", organization: "Contoso", dates: "2019 – 2022", location: "Manchester", bullets: [
        { id: "4", text: "Shipped the mobile app’s onboarding, cutting drop-off by a third.", source: "fact", factIds: ["x"] },
        { id: "5", text: "Partnered with engineering to set up visual regression tests.", source: "fact", factIds: ["x"] },
      ] },
    ] },
    { id: "education", kind: "education", title: "Education", items: [{ entryId: "c", title: "BA Interaction Design", organization: "University of the Arts", dates: "2015 – 2019", bullets: [] }] },
    { id: "project", kind: "project", title: "Projects", items: [{ entryId: "d", title: "Open-source icon set", dates: "2023", bullets: [{ id: "6", text: "900 icons, 2k GitHub stars.", source: "fact", factIds: ["x"] }] }] },
    { id: "skills", kind: "skills", title: "Skills", groups: [{ label: "Design", values: ["Figma", "Prototyping", "User research", "Design systems"] }, { label: "Tools", values: ["HTML/CSS", "Framer", "Notion"] }] },
    { id: "languages", kind: "languages", title: "Languages", groups: [{ label: "", values: ["English (native)", "French (B2)"] }] },
  ],
})

/** The person's most recent CV, so templates are previewed with their own content. */
export async function previewContent(): Promise<CvDocument> {
  const [doc] = await db.select({ revisionId: documents.currentRevisionId }).from(documents).where(eq(documents.kind, "cv")).orderBy(desc(documents.createdAt)).limit(1)
  if (doc?.revisionId) {
    const [rev] = await db.select({ content: revisions.content }).from(revisions).where(eq(revisions.id, doc.revisionId))
    const parsed = cvDocument.safeParse(rev?.content)
    if (parsed.success) return parsed.data
  }
  return SAMPLE
}

export async function renderTemplatePreview(tokens: unknown, sample = false) {
  const design = designTokens.parse(tokens)
  const base = sample ? SAMPLE : await previewContent()
  return renderCvPdf({ ...base, template: "custom", design, accent: design.accent, header: { ...base.header, showPhoto: Boolean(base.header.photoPath) } })
}
