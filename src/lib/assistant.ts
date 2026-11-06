import { z } from "zod"

/** What the assistant can suggest. Each one is applied only when the user clicks it. */
export const proposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("application"), id: z.string().uuid(), label: z.string().max(120),
    status: z.enum(["submitted", "interviewing", "offer", "rejected", "withdrawn"]).optional(),
    nextStep: z.string().max(200).optional(), nextStepDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), archived: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("contact"), name: z.string().min(1).max(120), title: z.string().max(160).default(""), companyName: z.string().max(160).default(""), email: z.string().max(254).default(""), linkedinUrl: z.string().max(500).default("") }),
  z.object({ kind: z.literal("job"), url: z.string().url().max(2000).refine((url) => /^https?:\/\//.test(url), "Use a web link") }),
  z.object({ kind: z.literal("open"), path: z.string().regex(/^\/[\w\-/?=&.%]*$/).max(200), label: z.string().max(60) }),
])
export type Proposal = z.infer<typeof proposalSchema>
