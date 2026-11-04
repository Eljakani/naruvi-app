import { z } from "zod"

const lines = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : value.split("\n")).map((item) => item.trim()).filter(Boolean))

export const entryKinds = ["experience", "education", "project", "skill", "certification", "language", "achievement", "other"] as const
export const entryStatuses = ["verified", "needs_review", "archived"] as const

export const displaySchema = z.object({
  role: z.string().trim().max(200).optional(),
  organization: z.string().trim().max(200).optional(),
  dates: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
  label: z.string().trim().max(200).optional(),
})

export const entryInput = z.object({
  title: z.string().trim().min(2, "Give the entry a title.").max(200),
  kind: z.enum(entryKinds),
  status: z.enum(entryStatuses),
  display: z.record(z.string().regex(/^[a-z]{2}$/), displaySchema).default({}),
  tags: lines.default([]),
  skills: lines.default([]),
  evidence: lines.default([]),
  doNotClaim: lines.default([]),
  confidential: z.boolean().default(false),
  logoPath: z
    .string()
    .regex(/^logos\/[a-f0-9]{24}\.(png|jpg|gif|webp|svg)$/)
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
      }),
    )
    .default([]),
})
export type EntryInput = z.input<typeof entryInput>

export const identityInput = z.object({
  fullName: z.string().trim().min(2).max(120),
  headline: z.string().trim().max(200).default(""),
  email: z.string().trim().email().or(z.literal("")),
  phone: z.string().trim().max(40).default(""),
  location: z.string().trim().max(120).default(""),
  availability: z.string().trim().max(120).default(""),
  links: z.array(z.object({ label: z.string().trim().min(1).max(40), url: z.string().trim().url() })).default([]),
})
export type IdentityInput = z.input<typeof identityInput>
