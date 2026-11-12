import { z } from "zod"
import { ENTRY_KINDS, cleanFields, cleanText, KIND_FIELDS } from "@/lib/entry-fields"

const lines = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : value.split("\n")).map((item) => item.trim()).filter(Boolean))

export const entryKinds = ENTRY_KINDS
export const entryStatuses = ["verified", "needs_review", "archived"] as const

export const entryInput = z.object({
  kind: z.enum(entryKinds),
  status: z.enum(entryStatuses),
  /** Kind-specific text per language: { fr: { position: "…" } }. */
  display: z.record(z.string().regex(/^[a-z]{2}$/), z.record(z.string(), z.string())).default({}),
  /** Kind-specific fields stored once: { company, dates, … }. */
  fields: z.record(z.string(), z.unknown()).default({}),
  tags: lines.default([]),
  skills: lines.default([]),
  evidence: lines.default([]),
  doNotClaim: lines.default([]),
  confidential: z.boolean().default(false),
  logoPath: z
    .string()
    .regex(/^logos\/[a-f0-9]{24}\.(png|jpg|gif|webp|svg|ico)$/)
    .nullable()
    .default(null),
  facts: z.array(z.object({ id: z.string().uuid().optional(), statement: z.string().trim().min(3).max(600) })).default([]),
  phrasings: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        group: z.string().trim().max(80).default("General"),
        role: z.enum(["bullet", "label"]).default("bullet"),
        language: z.string().regex(/^[a-z]{2}$/),
        text: z.string().trim().min(3).max(600),
        /** Indexes into `facts` (new facts have no id yet). */
        factRefs: z.array(z.number().int().nonnegative()).optional(),
        /** Kept from an automatic translation, so Naruvi still knows the line is its own (see src/lib/auto-translate.ts). */
        autoText: z.string().max(600).nullable().optional(),
        autoSource: z.string().max(600).nullable().optional(),
      }),
    )
    .default([]),
})
  .transform((entry, ctx) => {
    try {
      const display = cleanText(entry.kind, entry.display)
      const fields = cleanFields(entry.kind, entry.fields)
      const required = KIND_FIELDS[entry.kind].find((spec) => spec.required)
      const named = !required || (required.translated ? Object.values(display).some((text) => text[required.key]) : Boolean(fields[required.key]))
      if (!named) ctx.addIssue({ code: "custom", path: [required!.translated ? "display" : "fields"], message: `Fill in the ${required!.key}.` })
      return { ...entry, display, fields }
    } catch (error) {
      ctx.addIssue({ code: "custom", path: ["fields"], message: error instanceof Error ? error.message : "Invalid field." })
      return z.NEVER
    }
  })

export type EntryInput = z.input<typeof entryInput>

export const identityInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  headlines: z.record(z.string().regex(/^[a-z]{2}$/), z.string().trim().max(160)).default({}),
  summaries: z.record(z.string().regex(/^[a-z]{2}$/), z.string().trim().max(1200)).default({}),
  photoPath: z
    .string()
    .regex(/^photos\/[a-f0-9]{24}\.(png|jpg|webp)$/)
    .nullable()
    .default(null),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(40).default(""),
  location: z.string().trim().max(120).default(""),
  availability: z.string().trim().max(120).default(""),
  links: z.array(z.object({ label: z.string().trim().min(1).max(40), url: z.string().trim().url().regex(/^https?:\/\//i) })).default([]),
})
export type IdentityInput = z.input<typeof identityInput>

export const profileDetailFields = ["fullName", "email", "phone", "location", "availability"] as const
const editableLink = z.object({
  label: z.string().trim().min(1).max(40),
  url: z.url({ protocol: /^https?$/ }).max(2048),
})

export const profileDetailEdit = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("field"),
    field: z.enum(profileDetailFields),
    previous: z.string(),
    value: z.string().describe("New value. Use an empty string to clear an optional field."),
  }),
  z.object({
    kind: z.literal("link"),
    previous: editableLink.nullable().describe("Exact existing link, or null to add a link."),
    value: editableLink.nullable().describe("New link, or null to remove the existing link."),
  }),
])
