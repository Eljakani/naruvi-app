import { z } from "zod"

export const draftMailInput = z.object({
  applicationId: z.string().uuid(),
  kind: z.enum(["apply", "follow_up", "thank_you", "reply"]),
  replyTo: z.string().uuid().nullable().default(null),
  instructions: z.string().trim().max(4000).default(""),
  tone: z.enum(["professional", "warm", "concise"]).default("professional"),
  language: z.enum(["auto", "en", "fr", "de", "es", "ar"]).default("auto"),
  subject: z.string().max(300).default(""),
  body: z.string().max(20_000).default(""),
  attachCv: z.boolean(),
  attachLetter: z.boolean(),
})

export type DraftMailInput = z.input<typeof draftMailInput>

export const mailDraftReply = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
  missingDetails: z.array(z.string().trim().min(1).max(200)).max(5),
})

export type MailDraft = z.infer<typeof mailDraftReply>
